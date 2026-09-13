"""gera dashboard/src/data/findings.json (dados do data-story em react) a partir do
dataset bruto, reaproveitando o pipeline de limpeza real de gsclean.cleaning.

os numeros de `pipeline` no json vem, palavra por palavra, do dict de metricas
retornado por `gsclean.cleaning.clean()` -- este script nao reimplementa aquela
logica, apenas chama a funcao. os achados de preco/categoria (outliers, contagens,
fragmentacao de categoria) sao derivados do mesmo frame "pre-clean, price>0" que
`powerbi/prepare_data.py` usa, pra ficar consistente com as tabelas ja publicadas
em powerbi/data/*.csv.

uso:
    PYTHONPATH=src python dashboard/prepare_dashboard_data.py
"""

from __future__ import annotations

import json
import re
import tempfile
import threading
import time
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import pandas as pd

from gsclean.cleaning import clean

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_PATH = REPO_ROOT / "data" / "raw" / "gymshark_products.csv"
POWERBI_DATA_DIR = REPO_ROOT / "powerbi" / "data"
OUTPUT_PATH = Path(__file__).resolve().parent / "src" / "data" / "findings.json"

OUTLIER_THRESHOLD = 500.0
# as duas variantes de cor do produto que respondem pelos 12 registros acima do
# limiar de preco (6 tamanhos cada). ver README.md, secao "prescriptive analysis".
OUTLIER_HANDLES: dict[str, str] = {
    "gymshark-collegiate-crop-tank-ink-teal-ss23": "Ink Teal",
    "gymshark-collegiate-crop-tank-dusty-maroon-ss23": "Dusty Maroon",
}

GALLERY_SIZE = 48
GALLERY_TOP_N_CATEGORIES = 8
STRIP_SAMPLE_SIZE = 700
RANDOM_STATE = 42
MAX_JSON_BYTES = 250_000

TIER_ORDER = ["same_handle", "same_title_type", "similar_title_token", "unresolved"]
TIER_LABELS: dict[str, str] = {
    "same_handle": "Same handle",
    "same_title_type": "Same title and type",
    "similar_title_token": "Shared title token",
    "unresolved": "Still missing",
}
TIER_RULES: dict[str, str] = {
    "same_handle": "borrow the image from another variant of the same product",
    "same_title_type": "borrow the image from a row with the exact same title and product type",
    "similar_title_token": "borrow the image from another product in the same type that shares the first title word",
    "unresolved": "no sibling variant exists to borrow an image from",
}

# em/en dash characters that must never appear in any copy string we emit.
_DASH_CHARS = ("–", "—")

# verificacao de urls de foto: a cdn ja derrubou algumas imagens do csv bruto,
# entao toda url candidata da galeria passa por um HEAD real antes de ser aceita.
BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
URL_CHECK_TIMEOUT = 8.0
URL_CHECK_RETRIES = 3
URL_CHECK_WORKERS = 8
URL_CHECK_LOOKAHEAD = 4
URL_CHECK_CACHE_PATH = Path(tempfile.gettempdir()) / "gymshark_dashboard_url_cache.json"


# ---------------------------------------------------------------------------
# duplicated-on-purpose: tiered image-filler replica
# ---------------------------------------------------------------------------
# gsclean.cleaning._greedy_image_filler (the real pipeline logic, called via
# clean() below) only returns a total count of rows it filled. it does not
# report which of its 3 fallback rules resolved each row, and it is a private
# module function we should not reach into. powerbi/prepare_data.py already
# faced the exact same need for its image-fill funnel chart and solved it by
# keeping a second copy of the same greedy logic that also records the tier
# name per row (`_greedy_filler_tiered`). we adapt that same copy here for the
# dashboard's funnel step. because this is a duplicate of pipeline logic, its
# output is asserted against clean()'s own metrics below (see
# build_images_block) -- if the two ever disagree, this script fails loudly
# instead of emitting numbers that quietly drifted apart.
#
# a replica tambem registra, por linha preenchida, DE QUAL linha ela copiou a
# imagem (`donor_of`). o filler muta o dataframe enquanto itera, entao uma linha
# preenchida vira doadora valida para as linhas seguintes: sem esse registro nao
# da pra distinguir "achei um irmao que ja tinha foto" de "copiei o palpite que
# eu mesmo acabei de escrever". ver build_images_block / provenance.
def _greedy_filler_tiered(df: pd.DataFrame) -> tuple[dict[int, str], dict[int, int]]:
    missing_mask = df["image_src"].isna() | (df["image_src"].astype(str).str.strip() == "")
    tier_of: dict[int, str] = {}
    donor_of: dict[int, int] = {}

    for idx in df[missing_mask].index:
        current = df.loc[idx]

        if "handle" in df.columns:
            same_handle = df[(df["handle"] == current.get("handle")) & df["image_src"].notna()]
            if len(same_handle) > 0:
                donor_of[idx] = same_handle.index[0]
                df.loc[idx, "image_src"] = same_handle["image_src"].iloc[0]
                tier_of[idx] = "same_handle"
                continue

        same_title_type = df[
            (df.get("title") == current.get("title"))
            & (df.get("product_type") == current.get("product_type"))
            & df["image_src"].notna()
        ]
        if len(same_title_type) > 0:
            donor_of[idx] = same_title_type.index[0]
            df.loc[idx, "image_src"] = same_title_type["image_src"].iloc[0]
            tier_of[idx] = "same_title_type"
            continue

        if isinstance(current.get("title"), str) and isinstance(current.get("product_type"), str):
            first_token = current["title"].split()[0]
            mask = (
                (df.get("product_type") == current["product_type"])
                & df["image_src"].notna()
                & df.get("title").astype(str).str.contains(first_token, na=False, regex=False)
            )
            similar = df[mask]
            if len(similar) > 0:
                donor_of[idx] = similar.index[0]
                df.loc[idx, "image_src"] = similar["image_src"].iloc[0]
                tier_of[idx] = "similar_title_token"
                continue

        tier_of[idx] = "unresolved"

    return tier_of, donor_of


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------
def first_https_image(value: object) -> str | None:
    """image_src no csv e uma lista separada por virgula; pega a primeira url,
    tira espacos e so aceita se comecar com https://. nunca retorna string vazia."""
    if not isinstance(value, str):
        return None
    first = value.split(",")[0].strip()
    return first if first.startswith("https://") else None


def assert_no_dashes(value: object, where: str) -> None:
    if isinstance(value, str):
        for ch in _DASH_CHARS:
            if ch in value:
                raise ValueError(f"em/en dash found in {where!r}: {value!r}")


def format_usd(value: float) -> str:
    """formata preco em dolar com separador de milhar e 2 casas: 1000.0 -> $1,000.00."""
    return f"${value:,.2f}"


def format_compact(value: float) -> str:
    """36.0 -> '36', 36.4 -> '36.4'. evita '36.0 times the average' na copy."""
    return f"{value:g}"


def missing_image_index(frame: pd.DataFrame) -> set[int]:
    """indices cujo image_src estava VAZIO no csv bruto (antes de qualquer
    preenchimento). usado tanto pela provenance quanto pelo flag
    image_is_borrowed de cada card da galeria."""
    mask = frame["image_src"].isna() | (frame["image_src"].astype(str).str.strip() == "")
    return {int(i) for i in frame[mask].index}


def load_raw() -> pd.DataFrame:
    return pd.read_csv(RAW_PATH)


def build_preclean_frame(raw: pd.DataFrame) -> pd.DataFrame:
    """mesmo frame usado por powerbi/prepare_data.py: preco > 0, sem passar por
    clean() (sem classificacao de product_type nem preenchimento de imagem)."""
    return raw[raw["price"] > 0].copy()


def normalize_series_keep_na(series: pd.Series) -> pd.Series:
    return series.where(series.isna(), series.astype(str).str.strip().str.lower())


# ---------------------------------------------------------------------------
# verificacao de urls de foto (a cdn ja derrubou parte das imagens do csv)
# ---------------------------------------------------------------------------
class UrlLivenessChecker:
    """checa se uma url de imagem ainda responde: HEAD primeiro, GET com Range
    como fallback (alguns cdns respondem 403/405 a HEAD). o resultado fica em
    cache em disco pra que rodadas repetidas nao refacam a rede. erros de
    transporte (timeout, dns) sao retentados e NAO entram no cache, entao uma
    falha de rede momentanea nao congela uma url boa como morta."""

    def __init__(self, cache_path: Path) -> None:
        self.cache_path = cache_path
        self._lock = threading.Lock()
        self._cache: dict[str, bool] = {}
        self.network_checks = 0
        self.rejected: set[str] = set()
        # urls que nao deu pra classificar (so erro de transporte). ficam fora
        # do cache e sao contadas no relatorio final pra que uma rodada feita
        # numa rede ruim seja visivel em vez de silenciosa.
        self.undetermined: set[str] = set()
        if cache_path.exists():
            try:
                loaded = json.loads(cache_path.read_text(encoding="utf-8"))
                self._cache = {str(k): bool(v) for k, v in loaded.items()}
            except (ValueError, OSError):
                self._cache = {}

    def _probe(self, url: str) -> str:
        for method in ("HEAD", "GET"):
            request = urllib.request.Request(
                url,
                method=method,
                headers={"User-Agent": BROWSER_USER_AGENT, "Accept": "*/*"},
            )
            if method == "GET":
                request.add_header("Range", "bytes=0-0")
            try:
                with urllib.request.urlopen(request, timeout=URL_CHECK_TIMEOUT) as response:
                    return "live" if int(response.status) < 400 else "dead"
            except urllib.error.HTTPError as exc:
                # 403/405/501 em HEAD: o cdn recusa o metodo, nao a url. tenta GET.
                if method == "HEAD" and exc.code in (403, 405, 501):
                    continue
                return "dead" if 400 <= exc.code < 500 else "error"
            except Exception:
                return "error"
        return "error"

    def _resolve(self, url: str) -> bool | None:
        """True = viva, False = morta de verdade (4xx), None = indeterminado.

        None e o caso em que so houve erro de transporte (timeout, dns, reset)
        nas N tentativas. nao da pra afirmar que a url morreu, entao o veredito
        nao pode virar um False persistido: isso congelaria uma foto boa como
        morta por causa de uma queda de rede de 2 segundos."""
        for attempt in range(URL_CHECK_RETRIES):
            verdict = self._probe(url)
            if verdict == "live":
                return True
            if verdict == "dead":
                return False
            time.sleep(0.4 * (attempt + 1))
        return None

    def is_live(self, url: str) -> bool:
        with self._lock:
            cached = self._cache.get(url)
        if cached is not None:
            if cached is False:
                self.rejected.add(url)
            return cached

        live = self._resolve(url)
        with self._lock:
            self.network_checks += 1
            # so vereditos definitivos entram no cache em disco. indeterminado
            # fica de fora pra ser reavaliado na proxima rodada.
            if live is not None:
                self._cache[url] = live
        if live is None:
            self.undetermined.add(url)
            # indeterminado nao entra na galeria nesta rodada, mas tambem nao
            # fica marcado como morto para as proximas.
            return False
        if not live:
            self.rejected.add(url)
        return live

    def warm(self, urls: list[str]) -> None:
        """pre-aquece o cache em paralelo pra nao serializar 48+ round trips."""
        pending = [u for u in dict.fromkeys(urls) if u not in self._cache]
        if not pending:
            return
        with ThreadPoolExecutor(max_workers=URL_CHECK_WORKERS) as pool:
            list(pool.map(self.is_live, pending))

    @property
    def checked(self) -> int:
        return len(self._cache)

    def save(self) -> None:
        try:
            self.cache_path.write_text(
                json.dumps(self._cache, indent=0, sort_keys=True), encoding="utf-8"
            )
        except OSError:
            pass


# ---------------------------------------------------------------------------
# overview
# ---------------------------------------------------------------------------
def build_top_categories(preclean: pd.DataFrame, n: int) -> list[dict]:
    counts = preclean["product_type"].dropna().astype(str).value_counts().head(n)
    return [{"product_type": str(k), "count": int(v)} for k, v in counts.items()]


def build_overview(preclean: pd.DataFrame, clean_df: pd.DataFrame, pipeline: dict) -> dict:
    price = preclean["price"]
    raw_pt = preclean["product_type"]
    norm_pt = normalize_series_keep_na(raw_pt)

    return {
        "total_products": int(pipeline["rows_out"]),
        "distinct_handles": int(clean_df["handle"].nunique()),
        "mean_price": round(float(price.mean()), 2),
        "median_price": round(float(price.median()), 2),
        "min_price": round(float(price.min()), 2),
        "max_price": round(float(price.max()), 2),
        # dropna=True de proposito: com dropna=False o bucket de nulos entra na
        # contagem como se "sem categoria" fosse um nome de categoria, e os
        # numeros saem 91/85 em vez dos corretos 90/84. os 7 nulos sao tratados
        # separadamente por clean() (product_type_filled).
        "product_types_raw": int(raw_pt.nunique()),
        "product_types_normalized": int(norm_pt.nunique()),
        "top_categories": build_top_categories(preclean, 10),
    }


# ---------------------------------------------------------------------------
# price finding
# ---------------------------------------------------------------------------
def build_price_histogram(prices: pd.Series) -> list[dict]:
    bins = list(range(0, 105, 5))  # 0..100 em passos de 5
    histogram = []
    for start in bins[:-1]:
        end = start + 5
        count = int(((prices >= start) & (prices < end)).sum())
        histogram.append({"bin_start": start, "bin_end": end, "count": count})
    overflow_count = int((prices >= 100).sum())
    histogram.append({"bin_start": 100, "bin_end": int(round(prices.max())), "count": overflow_count})
    return histogram


def build_strip_sample(preclean: pd.DataFrame, outlier_index: pd.Index) -> list[float]:
    non_outlier_prices = preclean.loc[~preclean.index.isin(outlier_index), "price"]
    n = min(STRIP_SAMPLE_SIZE, len(non_outlier_prices))
    sample = non_outlier_prices.sample(n=n, random_state=RANDOM_STATE)
    return sorted(round(float(v), 2) for v in sample.tolist())


def build_price_block(
    preclean: pd.DataFrame, clean_df: pd.DataFrame, missing_images: set[int]
) -> dict:
    outliers_df = preclean[preclean["price"] > OUTLIER_THRESHOLD]

    if len(outliers_df) != 12:
        raise AssertionError(f"expected 12 price outliers, found {len(outliers_df)}")
    if not (outliers_df["price"] == 1000.0).all():
        raise AssertionError("not all price outliers are 1000.0")

    mean_price = float(preclean["price"].mean())
    pct_of_total = round(len(outliers_df) / len(preclean) * 100, 2)
    multiple_of_mean = round(1000.0 / mean_price, 1)

    sizes_per_product = int(outliers_df.groupby("handle").size().iloc[0])

    outliers_list = []
    for idx, row in outliers_df.iterrows():
        image = first_https_image(clean_df.loc[idx, "image_src"]) if idx in clean_df.index else None
        outliers_list.append(
            {
                "handle": str(row["handle"]),
                "title": str(row["title"]),
                "variant_title": str(row["variant_title"]),
                "sku": str(row["sku"]),
                "product_type": str(row["product_type"]),
                "price": round(float(row["price"]), 2),
                "image": image,
                # a foto nao e deste produto: a linha estava sem imagem no csv
                # bruto e herdou a de outro produto durante o preenchimento.
                "image_is_borrowed": bool(int(idx) in missing_images),
            }
        )

    return {
        "outlier_threshold": int(OUTLIER_THRESHOLD),
        "outlier_count": len(outliers_list),
        "outlier_price": 1000.0,
        "outlier_pct_of_total": pct_of_total,
        "multiple_of_mean": multiple_of_mean,
        "distinct_products": int(outliers_df["handle"].nunique()),
        "sizes_per_product": sizes_per_product,
        "histogram": build_price_histogram(preclean["price"]),
        "strip_sample": build_strip_sample(preclean, outliers_df.index),
        "outliers": outliers_list,
    }


# ---------------------------------------------------------------------------
# image finding
# ---------------------------------------------------------------------------
def build_provenance(
    tier_of: dict[int, str], donor_of: dict[int, int], missing_images: set[int]
) -> dict:
    """de ONDE cada foto preenchida veio de verdade.

    por que provenance e tiers discordam: o filler muta o dataframe enquanto
    itera. no inicio do loop NENHUMA das 128 linhas sem foto tem um irmao de
    mesmo handle que ja tenha imagem, entao a primeira linha de cada handle cai
    no tier 3 (similar_title_token, uma foto emprestada de OUTRO produto que so
    divide a primeira palavra do titulo) e grava esse palpite no frame. as
    linhas seguintes do mesmo handle passam a encontrar esse palpite e batem no
    tier 1. ou seja: o tier 1 nao mede "achei um irmao legitimo", mede "ja
    passei por aqui". o split de tiers e efeito da ORDEM de iteracao, nao um
    ranking de qualidade de match. o bloco tiers continua sendo emitido como
    esta porque as tabelas ja publicadas em powerbi/data/image_fill_funnel.csv
    validam contra ele; a provenance e a leitura honesta do mesmo processo."""
    genuine = 0
    token_seeds = 0
    propagated = 0
    unresolved = 0
    clean_donors: set[int] = set()

    for idx, tier in tier_of.items():
        if tier == "unresolved":
            unresolved += 1
            continue
        donor = donor_of[idx]
        if int(donor) in missing_images:
            # o doador tambem estava sem foto no csv bruto: isto e a propagacao
            # de um palpite, nao uma resolucao.
            propagated += 1
            continue
        clean_donors.add(int(donor))
        if tier == "similar_title_token":
            token_seeds += 1
        else:
            genuine += 1

    return {
        "genuine_sibling_resolutions": genuine,
        "token_guess_seeds": token_seeds,
        "propagated_from_guesses": propagated,
        "distinct_clean_donor_rows": len(clean_donors),
        "order_dependent": True,
    }


def build_images_block(preclean: pd.DataFrame, pipeline: dict, missing_images: set[int]) -> dict:
    tier_frame = preclean.copy()  # copia isolada: nao contamina o clean_df do pipeline
    tier_of, donor_of = _greedy_filler_tiered(tier_frame)

    initial_missing = int(
        (preclean["image_src"].isna() | (preclean["image_src"].astype(str).str.strip() == "")).sum()
    )
    counts = Counter(tier_of.values())
    resolved_total = counts.get("same_handle", 0) + counts.get("same_title_type", 0) + counts.get(
        "similar_title_token", 0
    )
    unresolved_total = counts.get("unresolved", 0)

    # HARD CHECK: a replica tem que bater com clean() de verdade. se nao bater,
    # falha alto em vez de publicar um funil que nao corresponde ao pipeline real.
    if resolved_total != pipeline["image_src_filled"]:
        raise AssertionError(
            f"tiered replica resolved={resolved_total} != clean() image_src_filled={pipeline['image_src_filled']}"
        )
    expected_unresolved = initial_missing - pipeline["image_src_filled"]
    if unresolved_total != expected_unresolved:
        raise AssertionError(
            f"tiered replica unresolved={unresolved_total} != initial_missing - image_src_filled={expected_unresolved}"
        )

    remaining = initial_missing
    tiers = []
    for key in TIER_ORDER:
        n = int(counts.get(key, 0))
        if key != "unresolved":
            remaining -= n
        tiers.append(
            {
                "key": key,
                "label": TIER_LABELS[key],
                "rule": TIER_RULES[key],
                "products": n,
                "remaining_after": int(remaining),
            }
        )

    provenance = build_provenance(tier_of, donor_of, missing_images)

    # HARD CHECK: a provenance particiona exatamente as mesmas 128 linhas que os
    # tiers, so que por origem real da foto em vez de por ordem de iteracao.
    provenance_total = (
        provenance["genuine_sibling_resolutions"]
        + provenance["token_guess_seeds"]
        + provenance["propagated_from_guesses"]
        + unresolved_total
    )
    if provenance_total != initial_missing:
        raise AssertionError(
            f"provenance partition sums to {provenance_total}, expected initial_missing={initial_missing}"
        )
    provenance_filled = provenance["token_guess_seeds"] + provenance["propagated_from_guesses"]
    if provenance_filled != pipeline["image_src_filled"]:
        raise AssertionError(
            f"provenance token_guess_seeds + propagated_from_guesses = {provenance_filled} != "
            f"clean() image_src_filled={pipeline['image_src_filled']}"
        )

    unresolved_idx = [idx for idx, tier in tier_of.items() if tier == "unresolved"]
    unresolved_rows = [
        {
            "handle": str(preclean.loc[idx, "handle"]),
            "title": str(preclean.loc[idx, "title"]),
            "product_type": str(preclean.loc[idx, "product_type"]),
            "price": round(float(preclean.loc[idx, "price"]), 2),
        }
        for idx in unresolved_idx
    ]

    return {
        "initial_missing": initial_missing,
        "resolved": resolved_total,
        "resolved_pct": round(resolved_total / initial_missing * 100, 1),
        "unresolved": unresolved_total,
        "tiers": tiers,
        "provenance": provenance,
        "unresolved_rows": unresolved_rows,
    }


# ---------------------------------------------------------------------------
# category finding
# ---------------------------------------------------------------------------
def build_categories_block(preclean: pd.DataFrame) -> dict:
    raw_pt = preclean["product_type"]
    pt = raw_pt.dropna().astype(str)
    raw_counts = pt.value_counts()

    frame = pd.DataFrame({"raw": pt})
    frame["norm"] = frame["raw"].str.strip().str.lower()
    per_raw = frame.groupby(["norm", "raw"]).size().reset_index(name="count")

    norm_totals = (
        frame.groupby("norm").size().reset_index(name="total").sort_values("total", ascending=False)
    ).reset_index(drop=True)
    norm_totals["rank"] = norm_totals.index + 1

    multi = per_raw.groupby("norm")["raw"].nunique()
    collapsed_norms = multi[multi > 1].index.tolist()
    totals_map = norm_totals.set_index("norm")["total"].to_dict()

    pairs = []
    for norm_key in sorted(collapsed_norms, key=lambda k: -totals_map[k]):
        variants = per_raw[per_raw["norm"] == norm_key].sort_values("count", ascending=False)
        pairs.append(
            {
                "norm": norm_key,
                "total": int(totals_map[norm_key]),
                "variants": [
                    {"raw": str(r), "count": int(c)} for r, c in zip(variants["raw"], variants["count"])
                ],
            }
        )

    top10_raw = [
        {"label": str(label), "count": int(count), "rank": i + 1}
        for i, (label, count) in enumerate(raw_counts.head(10).items())
    ]

    # rank_delta: compara a posicao (no ranking normalizado) do grupo com a
    # posicao que a sua grafia dominante (mais frequente) ocupava no ranking bruto.
    canon = per_raw.loc[per_raw.groupby("norm")["count"].idxmax()][["norm", "raw"]].rename(
        columns={"raw": "canonical_raw"}
    )
    raw_rank_map = {label: i + 1 for i, label in enumerate(raw_counts.index)}
    norm_top10 = norm_totals.head(10).merge(canon, on="norm", how="left")

    top10_normalized = []
    for _, r in norm_top10.iterrows():
        raw_rank = raw_rank_map.get(r["canonical_raw"])
        rank_delta = int(raw_rank - r["rank"]) if raw_rank is not None else 0
        top10_normalized.append(
            {
                "label": str(r["norm"]),
                "count": int(r["total"]),
                "rank": int(r["rank"]),
                "rank_delta": rank_delta,
            }
        )

    # ver comentario em build_overview: nulo nao e uma categoria, entao
    # dropna=True. 90 valores brutos colapsam em 84 normalizados, e a
    # diferenca (6) bate exatamente com len(collapsed_norms).
    raw_unique = int(raw_pt.nunique())
    normalized_unique = int(normalize_series_keep_na(raw_pt).nunique())
    # este assert e o que pega o bug do bucket de nulos: com dropna=False os
    # dois numeros sobem 1 cada, a diferenca continua 6 e o erro passa
    # despercebido nas contagens absolutas. aqui ele falha alto.
    if raw_unique - normalized_unique != len(collapsed_norms):
        raise AssertionError(
            f"raw_unique - normalized_unique = {raw_unique - normalized_unique}, "
            f"mas ha {len(collapsed_norms)} grupos colapsados. "
            "provavel contagem do bucket de nulos como categoria."
        )

    return {
        "raw_unique": raw_unique,
        "normalized_unique": normalized_unique,
        "collapsed_groups": len(collapsed_norms),
        "pairs": pairs,
        "top10_raw": top10_raw,
        "top10_normalized": top10_normalized,
    }


# ---------------------------------------------------------------------------
# cross-check against the already-published power bi tables
# ---------------------------------------------------------------------------
def cross_check_against_powerbi_csvs(price_block: dict, images_block: dict, categories_block: dict) -> None:
    published_outliers = pd.read_csv(POWERBI_DATA_DIR / "price_outliers.csv")
    if len(published_outliers) != price_block["outlier_count"]:
        raise AssertionError("outlier row count differs from powerbi/data/price_outliers.csv")
    ours_outlier_handles = sorted(row["handle"] for row in price_block["outliers"])
    theirs_outlier_handles = sorted(published_outliers["handle"].tolist())
    if ours_outlier_handles != theirs_outlier_handles:
        raise AssertionError("outlier handles differ from powerbi/data/price_outliers.csv")

    published_funnel = pd.read_csv(POWERBI_DATA_DIR / "image_fill_funnel.csv").set_index("tier")["products"]
    for tier in images_block["tiers"]:
        expected = int(published_funnel.loc[tier["key"]])
        if expected != tier["products"]:
            raise AssertionError(
                f"tier {tier['key']} products={tier['products']} differs from "
                f"powerbi/data/image_fill_funnel.csv={expected}"
            )
    published_initial_missing = int(pd.read_csv(POWERBI_DATA_DIR / "image_fill_funnel.csv")["initial_missing"].iloc[0])
    if published_initial_missing != images_block["initial_missing"]:
        raise AssertionError("initial_missing differs from powerbi/data/image_fill_funnel.csv")

    published_frag = pd.read_csv(POWERBI_DATA_DIR / "category_fragmentation.csv")
    ours_frag_rows = sorted(
        (pair["norm"], variant["raw"], variant["count"])
        for pair in categories_block["pairs"]
        for variant in pair["variants"]
    )
    theirs_frag_rows = sorted(
        (row["norm"], row["raw"], int(row["count"])) for _, row in published_frag.iterrows()
    )
    if ours_frag_rows != theirs_frag_rows:
        raise AssertionError("category fragmentation pairs differ from powerbi/data/category_fragmentation.csv")

    published_counts = pd.read_csv(POWERBI_DATA_DIR / "category_counts.csv").head(10)
    ours_top10 = [(row["label"], row["count"]) for row in categories_block["top10_raw"]]
    theirs_top10 = [(row["product_type"], int(row["count"])) for _, row in published_counts.iterrows()]
    if ours_top10 != theirs_top10:
        raise AssertionError("top10_raw differs from powerbi/data/category_counts.csv")

    print("cross-check against powerbi/data/*.csv: PASS")


# ---------------------------------------------------------------------------
# gallery
# ---------------------------------------------------------------------------
def build_outlier_note(variant_name: str, price_block: dict) -> str:
    """monta a nota do card de outlier a partir dos numeros ja calculados em
    build_price_block, em vez de repetir estatisticas na mao. assim a copy nao
    tem como divergir dos dados."""
    return (
        f"Suspected price data entry error. This {variant_name} variant is priced at "
        f"{format_usd(price_block['outlier_price'])} flat across all "
        f"{price_block['sizes_per_product']} sizes, one of only "
        f"{price_block['distinct_products']} products ({price_block['outlier_count']} rows) "
        f"at that price, about {format_compact(price_block['multiple_of_mean'])} times the "
        "dataset average."
    )


def pick_live_rows(group: pd.DataFrame, k: int, checker: UrlLivenessChecker) -> pd.DataFrame:
    """embaralha o grupo com a seed fixa e desce a lista pegando so as linhas
    cuja foto ainda responde na cdn. a ORDEM e determinista (nao depende da
    rede); a rede so decide quais entradas dessa ordem sao puladas."""
    if k <= 0 or len(group) == 0:
        return group.iloc[0:0]

    shuffled = group.sample(frac=1, random_state=RANDOM_STATE)
    picked_idx: list = []
    cursor = 0
    while len(picked_idx) < k and cursor < len(shuffled):
        still_needed = k - len(picked_idx)
        window = shuffled.iloc[cursor : cursor + still_needed + URL_CHECK_LOOKAHEAD]
        checker.warm([str(v) for v in window["image"]])
        for idx, row in window.iterrows():
            if len(picked_idx) >= k:
                break
            if checker.is_live(str(row["image"])):
                picked_idx.append(idx)
        cursor += len(window)

    return shuffled.loc[picked_idx]


def build_gallery(
    clean_df: pd.DataFrame,
    categories_block: dict,
    price_block: dict,
    missing_images: set[int],
    checker: UrlLivenessChecker,
) -> list[dict]:
    candidates = clean_df.drop_duplicates(subset="handle", keep="first").copy()
    candidates["image"] = candidates["image_src"].map(first_https_image)
    candidates = candidates[candidates["image"].notna()].copy()

    outlier_handles = list(OUTLIER_HANDLES.keys())
    outlier_rows = candidates[candidates["handle"].isin(outlier_handles)].copy()
    if len(outlier_rows) != len(outlier_handles):
        raise AssertionError("could not find both price-outlier handles among gallery candidates")

    # os 2 cards de outlier sao obrigatorios, entao a url deles nao pode ser
    # descartada em silencio: se estiver morta, falha alto.
    checker.warm([str(v) for v in outlier_rows["image"]])
    for _, row in outlier_rows.iterrows():
        url = str(row["image"])
        if not checker.is_live(url):
            reason = "unreachable" if url in checker.undetermined else "dead"
            raise AssertionError(f"price-outlier image url is {reason}: {url}")

    pool = candidates[~candidates["handle"].isin(outlier_handles)].copy()
    top_cats = [row["label"] for row in categories_block["top10_raw"][:GALLERY_TOP_N_CATEGORIES]]

    remaining_slots = GALLERY_SIZE - len(outlier_rows)
    base, extra = divmod(remaining_slots, len(top_cats))

    picked_frames = []
    for i, category in enumerate(top_cats):
        k = base + (1 if i < extra else 0)
        group = pool[pool["product_type"] == category]
        picked_frames.append(pick_live_rows(group, min(k, len(group)), checker))
    picked = pd.concat(picked_frames)

    if len(picked) < remaining_slots:
        deficit = remaining_slots - len(picked)
        leftover = pool[~pool["handle"].isin(picked["handle"])]
        picked = pd.concat([picked, pick_live_rows(leftover, deficit, checker)])

    gallery_rows = pd.concat([outlier_rows, picked]).drop_duplicates(subset="handle")
    if len(gallery_rows) != GALLERY_SIZE:
        raise AssertionError(f"gallery has {len(gallery_rows)} cards, expected {GALLERY_SIZE}")

    # sem reset_index: o indice original e a chave que diz se a foto da linha
    # foi emprestada (ver missing_images).
    gallery_rows = gallery_rows.sort_values(["product_type", "handle"])

    cards = []
    for idx, row in gallery_rows.iterrows():
        handle = str(row["handle"])
        is_outlier = handle in OUTLIER_HANDLES
        note = None
        if is_outlier:
            note = build_outlier_note(OUTLIER_HANDLES[handle], price_block)
        card = {
            "handle": handle,
            "title": str(row["title"]),
            "product_type": str(row["product_type"]),
            "price": round(float(row["price"]), 2),
            "image": str(row["image"]),
            "is_outlier": bool(is_outlier),
            # a foto nao e deste produto: o image_src estava vazio no csv bruto
            # e o filler copiou a imagem de outra linha.
            "image_is_borrowed": bool(int(idx) in missing_images),
            "note": note,
        }
        assert_no_dashes(card["note"], f"gallery note for {handle}")
        cards.append(card)

    outlier_flags = sum(1 for c in cards if c["is_outlier"])
    if outlier_flags != 2:
        raise AssertionError(f"expected exactly 2 outlier gallery cards, found {outlier_flags}")

    return cards


# ---------------------------------------------------------------------------
# assembly + validation
# ---------------------------------------------------------------------------
def _walk_strings(obj, path="findings"):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from _walk_strings(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _walk_strings(v, f"{path}[{i}]")
    elif isinstance(obj, str):
        yield path, obj


def validate_findings(findings: dict) -> None:
    for path, value in _walk_strings(findings):
        assert_no_dashes(value, path)


def main() -> None:
    raw = load_raw()
    clean_df, pipeline = clean(raw.copy(), verbose=False)
    preclean = build_preclean_frame(raw)

    if len(preclean) != pipeline["rows_out"]:
        raise AssertionError(
            f"preclean frame has {len(preclean)} rows but clean() rows_out={pipeline['rows_out']}"
        )

    # conjunto de indices sem foto no csv bruto, calculado UMA vez e reusado
    # pela provenance e pelos flags image_is_borrowed.
    missing_images = missing_image_index(preclean)

    checker = UrlLivenessChecker(URL_CHECK_CACHE_PATH)

    overview = build_overview(preclean, clean_df, pipeline)
    price = build_price_block(preclean, clean_df, missing_images)
    images = build_images_block(preclean, pipeline, missing_images)
    categories = build_categories_block(preclean)
    cross_check_against_powerbi_csvs(price, images, categories)
    try:
        gallery = build_gallery(clean_df, categories, price, missing_images, checker)
    finally:
        checker.save()

    findings = {
        "generated_at": date.today().isoformat(),
        "source": {
            "raw_csv": "data/raw/gymshark_products.csv",
            "cleaner": "gsclean.cleaning.clean",
        },
        "pipeline": pipeline,
        "overview": overview,
        "price": price,
        "images": images,
        "categories": categories,
        "gallery": gallery,
    }

    validate_findings(findings)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(findings, indent=2, allow_nan=False, ensure_ascii=False)
    if re.search(r"[–—]", text):
        raise AssertionError("em/en dash character found in serialised findings.json")
    OUTPUT_PATH.write_text(text, encoding="utf-8")

    size_bytes = OUTPUT_PATH.stat().st_size
    if size_bytes > MAX_JSON_BYTES:
        raise AssertionError(f"findings.json is {size_bytes} bytes, over the {MAX_JSON_BYTES} limit")

    print(f"wrote {OUTPUT_PATH} ({size_bytes:,} bytes)")
    print(f"pipeline: {pipeline}")
    print(
        f"overview: total_products={overview['total_products']} "
        f"distinct_handles={overview['distinct_handles']} median_price={overview['median_price']}"
    )
    print(
        f"price: outlier_count={price['outlier_count']} outlier_pct_of_total={price['outlier_pct_of_total']} "
        f"strip_sample_len={len(price['strip_sample'])}"
    )
    print(
        f"images: initial_missing={images['initial_missing']} resolved={images['resolved']} "
        f"unresolved={images['unresolved']} resolved_pct={images['resolved_pct']}"
    )
    print(
        f"categories: raw_unique={categories['raw_unique']} normalized_unique={categories['normalized_unique']} "
        f"collapsed_groups={categories['collapsed_groups']}"
    )
    prov = images["provenance"]
    print(
        f"images provenance: genuine_sibling_resolutions={prov['genuine_sibling_resolutions']} "
        f"token_guess_seeds={prov['token_guess_seeds']} "
        f"propagated_from_guesses={prov['propagated_from_guesses']} "
        f"distinct_clean_donor_rows={prov['distinct_clean_donor_rows']}"
    )
    print(
        f"image urls: {checker.checked} checked "
        f"({checker.network_checks} over the network this run), "
        f"{len(checker.rejected)} rejected as dead, "
        f"{len(checker.undetermined)} left undetermined (network, not cached)"
    )
    borrowed = sum(1 for c in gallery if c["image_is_borrowed"])
    print(
        f"gallery: {len(gallery)} cards, {sum(1 for c in gallery if c['is_outlier'])} flagged as outliers, "
        f"{borrowed} showing a borrowed photo"
    )


if __name__ == "__main__":
    main()
