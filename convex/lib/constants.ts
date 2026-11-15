export const CATEGORIES = [
  "power_tools",
  "hand_tools",
  "garden",
  "kitchen",
  "camping",
  "cleaning",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

// Field limits. Convex enforces them; the client imports the same numbers for its
// inline checks. This file is pure (no server imports), so the browser can load it.
export const TOOL_NAME_MIN = 2;
export const TOOL_NAME_MAX = 60;
export const TOOL_DESCRIPTION_MAX = 280;
/** An admin's optional reason for removing a listing, counted after trimming. */
export const REMOVAL_REASON_MAX = 280;
/** A member's display name, in characters (code points) after cleaning. */
export const DISPLAY_NAME_MAX = 60;

export const CONDITIONS = ["like_new", "good", "fair", "worn"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  other: "Other",
};

export const CONDITION_LABELS: Record<Condition, string> = {
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
  worn: "Worn",
};

export const CATEGORY_CODES: Record<Category, string> = {
  power_tools: "PWR",
  hand_tools: "HND",
  garden: "GDN",
  kitchen: "KIT",
  camping: "CMP",
  cleaning: "CLN",
  other: "OTH",
};
