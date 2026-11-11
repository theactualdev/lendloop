import type { MutationCtx } from "../_generated/server";
import { CATEGORY_CODES, type Category } from "./constants";

export async function nextShortCode(ctx: MutationCtx, category: Category): Promise<string> {
  // Codes identify a tool for life (update never rewrites shortCode), so scan every
  // tool carrying this prefix, whatever its status or current category.
  const code = CATEGORY_CODES[category];
  const prefix = `${code} `;
  const tools = await ctx.db
    .query("tools")
    .withIndex("by_shortCode", (q) => q.gte("shortCode", prefix).lt("shortCode", `${code}!`))
    .collect();
  let highest = 0;
  for (const t of tools) {
    const n = Number(t.shortCode.slice(prefix.length));
    if (Number.isInteger(n) && n > highest) highest = n;
  }
  return `${CATEGORY_CODES[category]} ${String(highest + 1).padStart(3, "0")}`;
}
