import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
 * The rubber stamp from the D files: a tilted, double-ruled box in IBM Plex
 * Mono caps, inked with multiply so it sits on the paper. Plan rule: stamps are
 * only for dates ("Back Nov 14", "Nov 12 – 14") and alerts ("Overdue"). Status
 * words go in plain text.
 *
 * Write the text in sentence case; CSS sets the caps, so screen readers read
 * "Back Nov 14" rather than spelling out "NOV".
 */
const stampVariants = cva(
  "inline-block shrink-0 border-2 font-mono leading-normal font-semibold whitespace-nowrap uppercase mix-blend-multiply select-none",
  {
    variants: {
      tone: {
        /** Dates: violet ink. */
        date: "border-violet text-violet outline-violet",
        /** Alerts: alert red. */
        alert: "border-alert text-alert outline-alert",
      },
      size: {
        /** In compact lists (the board's Your loans). Single rule. */
        sm: "-rotate-3 rounded-[3px] px-1.5 py-0.5 text-[10px] tracking-[0.1em]",
        /** In a table row's status column. */
        md: "-rotate-3 rounded-[3px] px-[7px] py-[3px] text-[11px] tracking-[0.1em] outline outline-offset-2",
        /** On an index card (the request card's dates). */
        lg: "-rotate-4 rounded-[4px] px-2.5 py-[5px] text-[13px] tracking-[0.12em] outline outline-offset-2",
      },
    },
    defaultVariants: { tone: "date", size: "md" },
  },
);

type StampProps = ComponentProps<"span"> & VariantProps<typeof stampVariants>;

export function Stamp({ className, tone, size, ...props }: StampProps) {
  return <span data-slot="stamp" className={cn(stampVariants({ tone, size }), className)} {...props} />;
}
