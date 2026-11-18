import Link from "next/link";
import { LogoMark } from "@/components/logo-mark";
import { cn } from "@/lib/utils";

/** The stamp mark, "LendLoop" and the catalog caption. Links home. Shared by every header. */
export function Wordmark({ captionClassName }: { captionClassName?: string }) {
  return (
    <Link
      href="/"
      className="flex min-h-11 items-baseline gap-3 pt-1.5 text-ink no-underline"
    >
      <span className="font-heading text-[26px] font-extrabold tracking-[-0.01em] whitespace-nowrap">
        {/* Inline, nudged down to centre on the capitals, so this span's baseline stays
            the word's and the caption still lines up with it. Under 360px it shrinks to
            26px so the landing page's "Sign in" stays on the same row at 320px. */}
        <LogoMark
          size={32}
          className="mr-2.5 inline-block align-[-7px] text-violet max-[360px]:mr-2 max-[360px]:size-[26px] max-[360px]:align-[-4px]"
        />
        LendLoop
      </span>
      {/* The caption gives way on narrow phones so the header stays on one line. */}
      <span
        className={cn(
          "hidden font-mono text-[11px] font-semibold tracking-[0.12em] text-ink-muted uppercase min-[560px]:inline",
          captionClassName,
        )}
      >
        Neighborhood tool library
      </span>
    </Link>
  );
}
