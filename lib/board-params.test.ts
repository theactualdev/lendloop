import { describe, expect, test } from "vitest";
import { boardSearch, isRequestableRange, readBoardParams } from "./board-params";

const TODAY = "2026-11-11";
const params = (query: string) => new URLSearchParams(query);

describe("isRequestableRange (same rules as INVALID_RANGE)", () => {
  test.each([
    ["today, one day", "2026-11-11", "2026-11-11", true],
    ["a three-day range", "2026-11-12", "2026-11-14", true],
    ["exactly 30 days", "2026-11-11", "2026-12-10", true],
    ["31 days", "2026-11-11", "2026-12-11", false],
    ["starts yesterday", "2026-11-10", "2026-11-12", false],
    ["ends before it starts", "2026-11-14", "2026-11-12", false],
    ["not a date", "2026-13-01", "2026-13-02", false],
    ["not a real day", "2026-11-31", "2026-12-01", false],
    ["wrong shape", "11/12/2026", "11/14/2026", false],
  ])("%s", (_label, from, to, ok) => {
    expect(isRequestableRange({ from, to }, TODAY)).toBe(ok);
  });
});

describe("readBoardParams", () => {
  test("keeps a valid category and range", () => {
    expect(readBoardParams(params("category=garden&from=2026-11-12&to=2026-11-14"), TODAY)).toEqual({
      category: "garden",
      range: { from: "2026-11-12", to: "2026-11-14" },
    });
  });

  test("nothing set", () => {
    expect(readBoardParams(params(""), TODAY)).toEqual({ category: null, range: null });
  });

  test("drops an unknown category but keeps a valid range", () => {
    expect(readBoardParams(params("category=boats&from=2026-11-12&to=2026-11-14"), TODAY)).toEqual({
      category: null,
      range: { from: "2026-11-12", to: "2026-11-14" },
    });
  });

  test.each([
    ["from only", "from=2026-11-12"],
    ["to only", "to=2026-11-14"],
    ["past start", "from=2026-11-01&to=2026-11-03"],
    ["reversed", "from=2026-11-14&to=2026-11-12"],
    ["too long", "from=2026-11-12&to=2026-12-31"],
    ["garbage", "from=soon&to=later"],
  ])("drops a bad range (%s) but keeps the category", (_label, query) => {
    expect(readBoardParams(params(`category=kitchen&${query}`), TODAY)).toEqual({
      category: "kitchen",
      range: null,
    });
  });
});

describe("boardSearch", () => {
  test("category, then dates", () => {
    expect(boardSearch({ category: "garden", range: { from: "2026-11-12", to: "2026-11-14" } })).toBe(
      "?category=garden&from=2026-11-12&to=2026-11-14",
    );
  });

  test("leaves out what is unset", () => {
    expect(boardSearch({ category: null, range: { from: "2026-11-12", to: "2026-11-14" } })).toBe(
      "?from=2026-11-12&to=2026-11-14",
    );
    expect(boardSearch({ category: "camping", range: null })).toBe("?category=camping");
    expect(boardSearch({ category: null, range: null })).toBe("");
  });
});
