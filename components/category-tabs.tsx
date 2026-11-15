"use client";

import { CATEGORIES, CATEGORY_LABELS, type Category } from "@/convex/lib/constants";
import { ScrollRow } from "@/components/scroll-row";
import { cn } from "@/lib/utils";

/*
 * Catalog-divider tabs (screen D): "All tools" first, then each category. The
 * pressed tab is white and joins the list below it. They are toggle buttons in
 * a labelled group: each one is a Tab stop and Enter or Space picks it.
 *
 * Below `sm` they are one swipeable row (ScrollRow) that keeps the pressed tab
 * in view. Its vertical padding, cancelled by a negative margin, holds the focus
 * outline and the pressed tab's 1px overlap onto the list's top border.
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
    <ScrollRow
      revealKey={value}
      role="group"
      aria-label="Filter by category"
      className={cn(
        "flex flex-wrap items-end gap-1 pl-3 max-sm:-my-1.5 max-sm:flex-nowrap max-sm:py-1.5 max-sm:pr-3",
        className,
      )}
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
              "cursor-pointer rounded-t-[10px] border border-border text-sm transition-colors max-sm:shrink-0 max-sm:whitespace-nowrap",
              pressed
                ? "relative z-[1] -mb-px min-h-12 border-b-paper bg-paper px-[18px] font-bold text-ink"
                : "min-h-11 border-b-0 bg-tab px-3.5 font-medium text-ink-quiet hover:bg-paper-muted hover:text-ink",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </ScrollRow>
  );
}
