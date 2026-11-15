import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { messageFor } from "@/lib/errors";
import { cn } from "@/lib/utils";

/*
 * The three states every list has besides its rows: loading, empty and error.
 * Same voices as the board's list and Your loans.
 */

export function ListSkeleton({
  label,
  rows = 3,
  className,
}: {
  /** Spoken while loading, e.g. "Loading your listings…". */
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">{label}</span>
      <ul role="list" aria-hidden="true" className="flex flex-col gap-3.5">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex flex-col gap-3 rounded-[4px] border bg-paper px-6 py-5">
            <span className="h-2.5 w-24 rounded-sm bg-divider motion-safe:animate-pulse" />
            <span className="h-4 w-2/5 rounded-sm bg-divider motion-safe:animate-pulse" />
            <span className="h-[26px] w-full rounded-sm bg-divider motion-safe:animate-pulse" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ListEmpty({
  title,
  children,
  className,
}: {
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[4px] border border-dashed border-control bg-paper px-5 py-5", className)}>
      <p className="font-heading text-xl font-bold">{title}</p>
      {children ? <div className="mt-1.5 text-[15px] leading-normal text-ink-soft">{children}</div> : null}
    </div>
  );
}

export function ListError({
  title,
  error,
  onRetry,
  className,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col gap-2 rounded-[4px] border border-alert-line bg-paper px-5 py-4", className)}
    >
      <p className="font-heading text-xl font-bold">{title}</p>
      <p className="text-[15px] leading-normal text-ink-soft">{messageFor(error)}</p>
      <Button variant="outline" size="sm" className="self-start" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
