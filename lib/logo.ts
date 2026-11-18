/*
 * The LendLoop mark: a serif L inside a round date stamp whose double ring is one
 * line that goes out around the L and doubles back. Two drawings, because the
 * double ring blurs into one thick band below about 40 px:
 *
 * - master (64-unit grid) from 48 px up: the double ring;
 * - small (16-unit grid) below that: one ring, same opening, an L fitted to the
 *   pixel grid. Tab icons and the header use it.
 *
 * Plain TypeScript with no imports, so scripts/make-icons.mjs can load it with
 * Node's type stripping as well as the app.
 */

export type LogoDrawing = {
  viewBox: string;
  /** One stroked line: no fill, round caps. */
  ring: string;
  ringWidth: number;
  /** The L, filled. */
  letter: string;
};

export const LOGO_MASTER: LogoDrawing = {
  viewBox: "0 0 64 64",
  ring: "M45.91 55.14A27 27 0 1 1 55.14 45.91A2.625 2.625 0 0 1 50.64 43.2A21.75 21.75 0 1 0 43.2 50.64",
  ringWidth: 3.5,
  letter: "M22 22H34V25H31V37H38V33H41V42H22V39H25V25H22Z",
};

export const LOGO_SMALL: LogoDrawing = {
  viewBox: "0 0 16 16",
  ring: "M11.29 14.18A7 7 0 1 1 14.18 11.29",
  ringWidth: 1.5,
  letter: "M5 4H9V5H8V10H10V9H11V12H5V11H6V5H5Z",
};

/** Colours for places the CSS tokens can't reach (icons, generated images). */
export const LOGO_COLORS = {
  /** --ll-violet */
  violet: "#4a35a8",
  /** The mark in a dark browser tab. */
  violetDark: "#a99bf2",
  /** The header's paper. */
  paper: "#f7f8f4",
  /** The board's ground. */
  ground: "#e2e7df",
  ink: "#1f1d1a",
  inkMuted: "#5e615a",
} as const;

/** The drawing for a mark shown `size` px wide. */
export function logoDrawing(size: number): LogoDrawing {
  return size < 48 ? LOGO_SMALL : LOGO_MASTER;
}
