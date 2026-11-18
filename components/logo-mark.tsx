import { logoDrawing } from "@/lib/logo";

/**
 * The stamp mark, drawn in currentColor. Decorative: it always sits beside the
 * word "LendLoop", so screen readers skip it.
 */
export function LogoMark({ size, className }: { size: number; className?: string }) {
  const drawing = logoDrawing(size);
  return (
    <svg
      width={size}
      height={size}
      viewBox={drawing.viewBox}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        d={drawing.ring}
        fill="none"
        stroke="currentColor"
        strokeWidth={drawing.ringWidth}
        strokeLinecap="round"
      />
      <path d={drawing.letter} fill="currentColor" />
    </svg>
  );
}
