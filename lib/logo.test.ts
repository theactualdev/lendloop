import { describe, expect, test } from "vitest";
import { LOGO_COLORS, LOGO_MASTER, LOGO_SMALL, iconSvg, logoDrawing } from "./logo";

describe("logoDrawing", () => {
  test("uses the small drawing below 48 px", () => {
    expect(logoDrawing(16)).toBe(LOGO_SMALL);
    expect(logoDrawing(32)).toBe(LOGO_SMALL);
    expect(logoDrawing(47)).toBe(LOGO_SMALL);
  });

  test("uses the master drawing from 48 px up", () => {
    expect(logoDrawing(48)).toBe(LOGO_MASTER);
    expect(logoDrawing(180)).toBe(LOGO_MASTER);
  });

  test("each drawing has its own grid", () => {
    expect(LOGO_SMALL.viewBox).toBe("0 0 16 16");
    expect(LOGO_MASTER.viewBox).toBe("0 0 64 64");
  });
});

describe("iconSvg", () => {
  test("draws the small mark on its 16-unit grid", () => {
    const svg = iconSvg();
    expect(svg).toContain('viewBox="0 0 16 16"');
    expect(svg).toContain(LOGO_SMALL.ring);
    expect(svg).toContain(LOGO_SMALL.letter);
  });

  test("is violet in a light tab and light violet in a dark one", () => {
    const svg = iconSvg();
    const [light, dark] = svg.split("@media (prefers-color-scheme: dark)");
    expect(light).toContain(LOGO_COLORS.violet);
    expect(dark).toContain(LOGO_COLORS.violetDark);
    expect(dark).not.toContain(LOGO_COLORS.violet);
  });
});
