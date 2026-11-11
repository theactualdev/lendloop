import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const ELEVATION = {
  /** Cards resting in a list (screen D3). */
  resting: "shadow-card",
  /** Side panels (screen D). */
  raised: "shadow-card-raised",
  /** A single hero card (screen D1). */
  lifted: "shadow-card-lifted",
} as const;

type IndexCardProps = ComponentProps<"article"> & {
  elevation?: keyof typeof ELEVATION;
};

/**
 * The library index card: white stock, a 4px corner and an ink-tinted shadow.
 * Pair it with IndexCardHeader for the red rule; use `border-card-line` for the
 * blue ruled lines inside. Label it with `aria-labelledby` pointing at its title.
 */
export function IndexCard({ className, elevation = "resting", ...props }: IndexCardProps) {
  return (
    <article
      data-slot="index-card"
      className={cn(
        "rounded-[4px] border bg-paper text-ink",
        ELEVATION[elevation],
        className,
      )}
      {...props}
    />
  );
}

/** The top of the card, closed off by the red rule. */
export function IndexCardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="index-card-header"
      className={cn("border-b-2 border-card-rule px-6 pt-[22px] pb-3.5", className)}
      {...props}
    />
  );
}

/** The card's title, set in Besley. Renders an h2; keep the page outline in order. */
export function IndexCardTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <h2
      data-slot="index-card-title"
      className={cn(
        "font-heading text-[26px] leading-[1.1] font-extrabold tracking-[-0.01em]",
        className,
      )}
      {...props}
    />
  );
}
