import { describe, expect, it } from "vitest";
import { DESCRIPTION_MAX, NAME_MAX, NAME_MIN, hasErrors, validateTool } from "./tool-form";

const ok = { name: "Pole saw", category: "garden", condition: "good", description: "Reaches 4 m." };

describe("validateTool", () => {
  it("mirrors the Convex limits", () => {
    expect([NAME_MIN, NAME_MAX, DESCRIPTION_MAX]).toEqual([2, 60, 280]);
  });
  it("accepts valid input and an empty description", () => {
    expect(validateTool(ok)).toEqual({});
    expect(hasErrors(validateTool({ ...ok, description: "" }))).toBe(false);
  });
  it("trims before measuring the name", () => {
    expect(validateTool({ ...ok, name: "  a  " }).name).toBeDefined();
    expect(validateTool({ ...ok, name: "  ab  " }).name).toBeUndefined();
    expect(validateTool({ ...ok, name: "   " }).name).toBeDefined();
  });
  it("cleans the name the way the server does before measuring it", () => {
    expect(validateTool({ ...ok, name: "\u0000a\u0007" }).name).toBeDefined();
    expect(validateTool({ ...ok, name: "a\u0000b" }).name).toBeUndefined();
    expect(validateTool({ ...ok, name: "\t\n" }).name).toBeDefined();
  });
  it("name bounds are 2 and 60", () => {
    expect(validateTool({ ...ok, name: "a" }).name).toBeDefined();
    expect(validateTool({ ...ok, name: "a".repeat(60) }).name).toBeUndefined();
    expect(validateTool({ ...ok, name: "a".repeat(61) }).name).toBeDefined();
  });
  it("description is at most 280 after trimming", () => {
    expect(validateTool({ ...ok, description: "x".repeat(280) }).description).toBeUndefined();
    expect(validateTool({ ...ok, description: "x".repeat(281) }).description).toBeDefined();
    expect(validateTool({ ...ok, description: `  ${"x".repeat(280)}  ` }).description).toBeUndefined();
  });
  it("category and condition must come from the constants", () => {
    expect(validateTool({ ...ok, category: "" }).category).toBeDefined();
    expect(validateTool({ ...ok, category: "toys" }).category).toBeDefined();
    expect(validateTool({ ...ok, condition: "mint" }).condition).toBeDefined();
    expect(validateTool({ ...ok, condition: "" }).condition).toBeDefined();
    expect(validateTool({ ...ok, category: "power_tools", condition: "worn" })).toEqual({});
  });
  it("reports every bad field at once", () => {
    const errors = validateTool({ name: "", category: "x", condition: "y", description: "z".repeat(300) });
    expect(Object.keys(errors).sort()).toEqual(["category", "condition", "description", "name"]);
    expect(hasErrors(errors)).toBe(true);
  });
});
