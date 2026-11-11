import Link from "next/link";

/** "LendLoop" plus the catalog caption. Links home. Shared by every header. */
export function Wordmark() {
  return (
    <Link
      href="/"
      className="flex min-h-11 items-baseline gap-3 pt-1.5 text-ink no-underline"
    >
      <span className="font-heading text-[26px] font-extrabold tracking-[-0.01em]">LendLoop</span>
      {/* The caption gives way on narrow phones so the header stays on one line. */}
      <span className="hidden font-mono text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase min-[520px]:inline">
        Neighborhood tool library
      </span>
    </Link>
  );
}
