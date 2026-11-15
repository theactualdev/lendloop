import { CATEGORIES, CONDITIONS } from "@/convex/lib/constants";

/*
 * Client-side mirror of the checks in convex/tools.ts (cleanName,
 * cleanDescription, cleanCategory, cleanCondition). Used for inline errors
 * before submit; Convex stays the enforcement point.
 */

export const NAME_MIN = 2;
export const NAME_MAX = 60;
export const DESCRIPTION_MAX = 280;

export type ToolInput = { name: string; category: string; condition: string; description: string };
export type ToolErrors = Partial<Record<keyof ToolInput, string>>;

export function validateTool(input: ToolInput): ToolErrors {
  const errors: ToolErrors = {};
  const name = input.name.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    errors.name = `Use ${NAME_MIN} to ${NAME_MAX} characters.`;
  }
  if (!(CATEGORIES as readonly string[]).includes(input.category)) errors.category = "Pick a category.";
  if (!(CONDITIONS as readonly string[]).includes(input.condition)) errors.condition = "Pick a condition.";
  if (input.description.trim().length > DESCRIPTION_MAX) {
    errors.description = `Keep it to ${DESCRIPTION_MAX} characters or fewer.`;
  }
  return errors;
}

export function hasErrors(errors: ToolErrors): boolean {
  return Object.keys(errors).length > 0;
}
