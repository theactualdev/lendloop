import { cn } from "@/lib/utils";

/**
 * The trusted-lender star (D files). With `label` it is an image with that
 * name; without, it is decorative (use it next to the words "Trusted lender").
 */
export function TrustedStar({ label, className }: { label?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      className={cn("size-[13px] shrink-0 text-violet", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <path
        d="M6 1l1.4 2.9 3.1.4-2.3 2.2.6 3.1L6 8.1 3.2 9.6l.6-3.1L1.5 4.3l3.1-.4L6 1z"
        fill="currentColor"
      />
    </svg>
  );
}
