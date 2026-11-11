"use client";

import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/convex/lib/constants";
import { cn } from "@/lib/utils";

/*
 * Catalog-divider tabs (screen D): "All tools" first, then each category. The
 * pressed tab is white and joins the list below it. They are toggle buttons in
 * a labelled group: each one is a Tab stop and Enter or Space picks it.
 */
export function CategoryTabs({
  value,
  onChange,
  className,
}: {
  value: Category | null;
  onChange: (category: Category | null) => void;
  className?: string;
}) {
  const tabs: { key: Category | null; label: string }[] = [
    { key: null, label: "All tools" },
    ...CATEGORIES.map((category) => ({ key: category, label: CATEGORY_LABELS[category] })),
  ];
  return (
    <div
      role="group"
      aria-label="Filter by category"
      className={cn("flex flex-wrap items-end gap-1 pl-3", className)}
    >
      {tabs.map((tab) => {
        const pressed = tab.key === value;
        return (
          <button
            key={tab.key ?? "all"}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(tab.key)}
            className={cn(
              "cursor-pointer rounded-t-[10px] border border-border text-sm transition-colors",
              pressed
                ? "relative z-[1] -mb-px min-h-12 border-b-paper bg-paper px-[18px] font-bold text-ink"
                : "min-h-11 border-b-0 bg-tab px-3.5 font-medium text-ink-quiet hover:bg-paper-muted hover:text-ink",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
