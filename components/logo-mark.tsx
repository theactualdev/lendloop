import { logoDrawing } from "@/lib/logo";

/**
 * The stamp mark, in currentColor unless `color` is given (the generated images
 * have no CSS to inherit from). Decorative: it always sits beside the word
 * "LendLoop", so screen readers skip it.
 */
export function LogoMark({
  size,
  className,
  color = "currentColor",
}: {
  size: number;
  className?: string;
  color?: string;
}) {
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
        stroke={color}
        strokeWidth={drawing.ringWidth}
        strokeLinecap="round"
      />
      <path d={drawing.letter} fill={color} />
    </svg>
  );
}
