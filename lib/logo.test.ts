import { describe, expect, test } from "vitest";
import { LOGO_MASTER, LOGO_SMALL, logoDrawing } from "./logo";

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
