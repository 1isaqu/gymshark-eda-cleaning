/*
  useTilt.ts
  ==========
  The cursor-tracked 3D tilt used by the product gallery cards.

  OWNERSHIP: this file is owned by the supervising agent, NOT by the
  gallery agent. Agent E imports and consumes this hook and must not
  edit or reimplement it. If the hook is missing something the gallery
  needs, report it instead of forking the maths into GalleryCard.tsx.

  WHY A SHARED HOOK: the tilt response curve is the visual signature of
  the whole page. Keeping it in one file means every card tilts with the
  identical feel, and the curve can be retuned in one place without
  touching component markup.

  MOTION CONTRACT (per CONTRACT.md section 3):
  - Pointer position is a continuous value, so it lives in Motion's
    `useMotionValue`, never in `useState`. `useState` would re-render
    the React tree on every pointer event and collapse on mid-range
    hardware once 48 cards are mounted.
  - Springs are what make this feel physical rather than robotic: the
    raw pointer value snaps instantly, the spring lags and settles.
  - `prefers-reduced-motion` pins every output to its neutral value.
*/
import { useCallback, useMemo, useRef } from "react";
import { useMotionValue, useSpring, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";
import { useReducedMotion } from "./useReducedMotion";

/** Spring feel for the tilt. Low stiffness + high damping reads as
 *  "heavy glass panel", not "wobbly jelly". */
const TILT_SPRING = { stiffness: 220, damping: 28, mass: 0.6 } as const;

/** Maximum rotation on either axis, in degrees. Kept modest on purpose:
 *  past roughly 14deg the product photo visibly skews and the card
 *  starts reading as a gimmick rather than as depth. */
export const DEFAULT_MAX_TILT_DEG = 10;

export interface TiltRotation {
  /** Rotation about the horizontal axis, in degrees. Positive tips the
   *  card's top edge away from the viewer. */
  rotateX: number;
  /** Rotation about the vertical axis, in degrees. Positive tips the
   *  card's right edge away from the viewer. */
  rotateY: number;
}

/**
 * Shapes the response. 1 is linear. Above 1 the card stays calmer around
 * the middle and builds toward the edges, which reads as a heavy panel
 * rather than a twitchy one. Past about 1.6 the centre feels dead.
 */
const EASE_EXPONENT = 1.25;

/**
 * How much rotation is given back in the corners. Each axis is computed
 * independently, so a corner would otherwise stack a full X tilt on top
 * of a full Y tilt and the card would visibly over-rotate exactly where
 * the pointer is least precise. At a dead corner the pair is scaled to
 * (1 - this).
 */
const CORNER_FALLOFF = 0.22;

/**
 * Map a normalised pointer position to a rotation, in degrees.
 *
 * `nx` and `ny` arrive normalised to the card's own box:
 *     -0.5 = left edge / top edge
 *      0   = dead centre
 *     +0.5 = right edge / bottom edge
 * Both are already clamped to [-0.5, 0.5] by the caller.
 *
 * `maxTiltDeg` bounds each axis, so both returned values stay inside
 * [-maxTiltDeg, +maxTiltDeg].
 *
 * DIRECTION: the surface rises to meet the cursor. Pointer near the top
 * brings the top edge toward the viewer; pointer near the right brings
 * the right edge toward the viewer. CSS rotates the other way on both
 * axes (positive rotateX tips the top AWAY, positive rotateY tips the
 * right AWAY), which is why X keeps the sign of `ny` and Y flips the
 * sign of `nx`. This direction is not arbitrary: the specular highlight
 * in `useTilt` tracks the raw pointer, and a real highlight sits where
 * the surface faces the viewer. Tilt away from the cursor instead and
 * the light and the geometry disagree.
 */
export function tiltFromPointer(
  nx: number,
  ny: number,
  maxTiltDeg: number,
): TiltRotation {
  // Rescale the box-normalised [-0.5, 0.5] to a full [-1, 1] swing.
  const ux = nx * 2;
  const uy = ny * 2;

  // Ease each axis independently, preserving direction.
  const easedX = Math.sign(ux) * Math.abs(ux) ** EASE_EXPONENT;
  const easedY = Math.sign(uy) * Math.abs(uy) ** EASE_EXPONENT;

  // Engagement of BOTH axes at once: 0 anywhere on a centre line (only
  // one axis is rotating, so nothing is stacking and nothing needs
  // correcting), 1 in a dead corner. Deliberately not a radial distance:
  // that would also damp a pure left/right or up/down tilt, where there
  // is no stacking, and the card would never reach maxTiltDeg at all.
  const bothAxes = Math.abs(ux) * Math.abs(uy);
  const falloff = 1 - CORNER_FALLOFF * bothAxes;

  return {
    rotateX: easedY * maxTiltDeg * falloff,
    rotateY: -easedX * maxTiltDeg * falloff,
  };
}

export interface UseTiltOptions {
  /** Override the maximum rotation on either axis, in degrees. */
  maxTiltDeg?: number;
}

export interface UseTilt {
  /** Attach to the element that should tilt. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Spread onto the same element. */
  handlers: {
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerLeave: () => void;
  };
  /** Feed straight into a `motion.div`'s `style` prop. */
  rotateX: MotionValue<number>;
  rotateY: MotionValue<number>;
  /** 0 at rest, 1 while the pointer is over the card. Drive the depth
   *  shadow and the specular highlight's opacity with this. */
  hoverProgress: MotionValue<number>;
  /** Pointer position as a percentage string ("50%"), for positioning a
   *  specular highlight gradient that tracks the cursor. */
  glareX: MotionValue<string>;
  glareY: MotionValue<string>;
  /** True when the user asked for reduced motion. The gallery should
   *  skip `perspective` and the highlight layer entirely when set. */
  reducedMotion: boolean;
}

/**
 * Cursor-tracked 3D tilt for a single card.
 *
 * Usage:
 *   const tilt = useTilt();
 *   <motion.div ref={tilt.ref} {...tilt.handlers}
 *     style={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY,
 *              transformStyle: "preserve-3d" }} />
 *
 * The parent element needs a `perspective` for the rotation to read as
 * depth rather than as a flat skew.
 */
export function useTilt(options: UseTiltOptions = {}): UseTilt {
  const { maxTiltDeg = DEFAULT_MAX_TILT_DEG } = options;
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);

  // Raw, unsprung normalised pointer position within the card.
  const nx = useMotionValue(0);
  const ny = useMotionValue(0);
  const hover = useMotionValue(0);

  // Springs smooth the raw pointer stream into something with weight.
  const springX = useSpring(nx, TILT_SPRING);
  const springY = useSpring(ny, TILT_SPRING);
  const hoverProgress = useSpring(hover, TILT_SPRING);

  // The response curve lives in `tiltFromPointer`, so both axes read
  // from the same function and can never drift apart.
  const rotateX = useTransform(
    [springX, springY],
    ([x, y]: number[]) => tiltFromPointer(x, y, maxTiltDeg).rotateX,
  );
  const rotateY = useTransform(
    [springX, springY],
    ([x, y]: number[]) => tiltFromPointer(x, y, maxTiltDeg).rotateY,
  );

  // Specular highlight follows the raw (unsprung) pointer, so the
  // glint tracks the cursor tightly while the card body lags behind it.
  const glareX = useTransform(nx, (value) => `${(value + 0.5) * 100}%`);
  const glareY = useTransform(ny, (value) => `${(value + 0.5) * 100}%`);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (reducedMotion) return;
      const element = ref.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const clamp = (value: number) => Math.min(0.5, Math.max(-0.5, value));
      nx.set(clamp((event.clientX - rect.left) / rect.width - 0.5));
      ny.set(clamp((event.clientY - rect.top) / rect.height - 0.5));
      hover.set(1);
    },
    [reducedMotion, nx, ny, hover],
  );

  const onPointerLeave = useCallback(() => {
    nx.set(0);
    ny.set(0);
    hover.set(0);
  }, [nx, ny, hover]);

  const handlers = useMemo(
    () => ({ onPointerMove, onPointerLeave }),
    [onPointerMove, onPointerLeave],
  );

  return {
    ref,
    handlers,
    rotateX,
    rotateY,
    hoverProgress,
    glareX,
    glareY,
    reducedMotion,
  };
}
