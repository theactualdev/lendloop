import {
  CATEGORIES,
  CONDITIONS,
  TOOL_DESCRIPTION_MAX,
  TOOL_NAME_MAX,
  TOOL_NAME_MIN,
} from "@/convex/lib/constants";
import { cleanText } from "@/convex/lib/text";

/*
 * Client-side mirror of the checks in convex/tools.ts (cleanName,
 * cleanDescription, cleanCategory, cleanCondition), with the same limits and the
 * same name cleaning imported from convex/lib (pure modules, no server code).
 * Used for inline errors before submit; Convex stays the enforcement point.
 */

export { TOOL_NAME_MIN as NAME_MIN, TOOL_NAME_MAX as NAME_MAX, TOOL_DESCRIPTION_MAX as DESCRIPTION_MAX };

export type ToolInput = { name: string; category: string; condition: string; description: string };
export type ToolErrors = Partial<Record<keyof ToolInput, string>>;

export function validateTool(input: ToolInput): ToolErrors {
  const errors: ToolErrors = {};
  const name = cleanText(input.name);
  if (name.length < TOOL_NAME_MIN || name.length > TOOL_NAME_MAX) {
    errors.name = `Use ${TOOL_NAME_MIN} to ${TOOL_NAME_MAX} characters.`;
  }
  if (!(CATEGORIES as readonly string[]).includes(input.category)) errors.category = "Pick a category.";
  if (!(CONDITIONS as readonly string[]).includes(input.condition)) errors.condition = "Pick a condition.";
  if (input.description.trim().length > TOOL_DESCRIPTION_MAX) {
    errors.description = `Keep it to ${TOOL_DESCRIPTION_MAX} characters or fewer.`;
  }
  return errors;
}

export function hasErrors(errors: ToolErrors): boolean {
  return Object.keys(errors).length > 0;
}
