/*
  Composes the page, and the only file that imports the sections. The
  sections take no props: each one reads what it needs from `findings`
  and owns its own layout, so the composition stays a plain list and
  reordering the story is a one-line change here.

  Each section sets its own anchor id through SectionShell (overview,
  price, images, categories, gallery). SiteNav's scroll-spy watches
  exactly those ids, so renaming one means renaming it in both places.
*/
import { SiteNav } from "./components/SiteNav";
import { SiteFooter } from "./components/SiteFooter";
import { Overview } from "./sections/Overview";
import { PriceFinding } from "./sections/PriceFinding";
import { ImageFinding } from "./sections/ImageFinding";
import { CategoryFinding } from "./sections/CategoryFinding";
import { Gallery } from "./sections/Gallery";

function App() {
  return (
    <>
      <SiteNav />
      <main>
        <Overview />
        <PriceFinding />
        <ImageFinding />
        <CategoryFinding />
        <Gallery />
      </main>
      <SiteFooter />
    </>
  );
}

export default App;
