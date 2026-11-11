import { describe, expect, test } from "vitest";
import { neighborName } from "./names";

describe("neighborName", () => {
  test("the first name when there is one, trimmed", () => {
    expect(neighborName("Ada")).toBe("Ada");
    expect(neighborName("  Ada ")).toBe("Ada");
    expect(neighborName("Ada", { capitalize: true })).toBe("Ada");
  });

  test("'your neighbor' by default, mid-sentence", () => {
    expect(neighborName("")).toBe("your neighbor");
    expect(neighborName(undefined)).toBe("your neighbor");
    expect(neighborName(null)).toBe("your neighbor");
    expect(neighborName("   ")).toBe("your neighbor");
  });

  test("'a neighbor' for labels like 'Lent by …'", () => {
    expect(neighborName("", { article: "a" })).toBe("a neighbor");
  });

  test("capitalized at the start of a sentence or as a label", () => {
    expect(neighborName("", { capitalize: true })).toBe("Your neighbor");
    expect(neighborName("", { article: "a", capitalize: true })).toBe("A neighbor");
  });
});
