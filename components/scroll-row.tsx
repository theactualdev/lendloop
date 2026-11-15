"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

/*
 * Below `sm`, one swipeable row (Ruling R32): it scrolls sideways with the
 * scrollbar hidden and fades out at an edge only while there is more to see
 * that way. From `sm` up it is a plain box and the caller sets the layout.
 *
 * The current item (aria-current="page" or aria-pressed="true") is kept in view
 * whenever `revealKey` changes: instantly on mount, smoothly afterwards unless
 * the visitor prefers reduced motion. Only the row scrolls, never the page.
 *
 * Focus outlines: the fade drops while a child has keyboard focus, and
 * scroll-padding keeps a focused item 40px clear of the edges. Callers give the
 * row vertical padding (cancelled by a negative margin) so the 3px outline is
 * not clipped by the scroll box.
 */

type Fade = "none" | "start" | "end" | "both";

/** How far from an edge a revealed item lands; matches `scroll-px-10`. */
const CLEAR = 40;

const CURRENT = '[aria-current="page"], [aria-pressed="true"]';

function fadeOf(row: HTMLElement): Fade {
  const max = row.scrollWidth - row.clientWidth;
  if (max <= 1) return "none";
  const start = row.scrollLeft > 1;
  const end = row.scrollLeft < max - 1;
  return start && end ? "both" : start ? "start" : end ? "end" : "none";
}

/** Scroll the row sideways, never the page, so `item` sits at least CLEAR px inside its edges. */
function reveal(row: HTMLElement, item: HTMLElement, behavior: ScrollBehavior) {
  // Nothing to do when the row fits (or is `display: contents` at desktop widths).
  if (row.scrollWidth <= row.clientWidth) return;
  const box = row.getBoundingClientRect();
  const rect = item.getBoundingClientRect();
  const delta =
    rect.left < box.left + CLEAR
      ? rect.left - (box.left + CLEAR)
      : rect.right > box.right - CLEAR
        ? rect.right - (box.right - CLEAR)
        : 0;
  const max = row.scrollWidth - row.clientWidth;
  const left = Math.min(max, Math.max(0, row.scrollLeft + delta));
  if (Math.abs(left - row.scrollLeft) >= 1) row.scrollTo({ left, behavior });
}

export function ScrollRow({
  revealKey,
  className,
  onFocus,
  onBlur,
  ...props
}: Omit<ComponentProps<"div">, "ref"> & { revealKey?: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  // The server assumes the row overflows; the first effect corrects it. A mask never moves layout.
  const [fade, setFade] = useState<Fade>("end");
  const [keyboard, setKeyboard] = useState(false);
  const revealed = useRef(false);

  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const update = () => setFade(fadeOf(row));
    update();
    row.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(row);
    for (const child of row.children) observer.observe(child);
    return () => {
      row.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const first = !revealed.current;
    revealed.current = true;
    const row = ref.current;
    const item = row?.querySelector<HTMLElement>(CURRENT);
    if (!row || !item) return;
    const smooth = !first && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reveal(row, item, smooth ? "smooth" : "auto");
  }, [revealKey]);

  return (
    <div
      ref={ref}
      data-fade={keyboard ? "none" : fade}
      onFocus={(event) => {
        const keyboardFocus = event.target.matches(":focus-visible");
        setKeyboard(keyboardFocus);
        // Browsers leave a half-visible item where it is; bring it fully in, outline and all.
        if (keyboardFocus) reveal(event.currentTarget, event.target, "auto");
        onFocus?.(event);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setKeyboard(false);
        onBlur?.(event);
      }}
      className={cn(
        "max-sm:flex max-sm:overflow-x-auto max-sm:overscroll-x-contain max-sm:scroll-px-10",
        "max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden",
        "max-sm:data-[fade=start]:[mask-image:linear-gradient(to_right,transparent,black_2rem)]",
        "max-sm:data-[fade=end]:[mask-image:linear-gradient(to_left,transparent,black_2rem)]",
        "max-sm:data-[fade=both]:[mask-image:linear-gradient(to_right,transparent,black_2rem,black_calc(100%_-_2rem),transparent)]",
        className,
      )}
      {...props}
    />
  );
}
