"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { adminSection } from "@/components/admin/section-boundary";
import { ListEmpty, ListSkeleton } from "@/components/list-state";
import { TrustedStar } from "@/components/trusted-star";
import { Switch } from "@/components/ui/switch";
import { neighborName } from "@/lib/names";
import { useCardAction } from "@/lib/use-card-action";

/* Trusted lenders (screen D5): a switch per lender, and how many times they have lent. */

type Lender = FunctionReturnType<typeof api.admin.lenders>[number];

const Boundary = adminSection("We couldn't load the lenders.");

export function TrustedLenders() {
  return (
    <section aria-labelledby="trusted-title" className="rounded-[4px] border bg-paper">
      <div className="px-5 pt-4 pb-1">
        <h2 id="trusted-title" className="font-heading text-[22px] font-extrabold">
          Trusted lenders
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[13px] leading-normal text-ink-soft">
          Trusted lenders get a <TrustedStar /> next to their name on every listing.
        </p>
      </div>
      <Boundary>
        <LenderRows />
      </Boundary>
    </section>
  );
}

function LenderRows() {
  const lenders = useQuery(api.admin.lenders, {});
  if (lenders === undefined) return <ListSkeleton label="Loading lenders…" rows={2} className="px-5 py-4" />;
  if (lenders.length === 0) {
    return (
      <div className="px-5 pt-3 pb-5">
        <ListEmpty title="No lenders yet.">Anyone who lists a tool shows up here.</ListEmpty>
      </div>
    );
  }
  return (
    <ul role="list" className="px-5 pt-1 pb-2">
      {lenders.map((lender) => (
        <LenderRow key={lender.userId} lender={lender} />
      ))}
    </ul>
  );
}

function LenderRow({ lender }: { lender: Lender }) {
  const setTrusted = useMutation(api.admin.setTrustedLender);
  const { busy, run } = useCardAction();
  const name = neighborName(lender.name.trim().split(/\s+/)[0], { article: "a" });
  return (
    <li className="border-t border-divider first:border-t-0">
      <label className="flex min-h-[52px] cursor-pointer items-center justify-between gap-3 py-1.5">
        <span>
          <span className="block text-[15px] font-semibold">{lender.name || name}</span>
          <span className="block text-[13px] text-ink-muted">
            {lender.timesLent === 1 ? "Lent 1 time" : `Lent ${lender.timesLent} times`}
          </span>
        </span>
        <Switch
          checked={lender.trustedLender}
          disabled={busy}
          aria-label={`Trusted lender: ${lender.name || name}`}
          onCheckedChange={(next) =>
            run(
              () => setTrusted({ userId: lender.userId, trusted: next }),
              () =>
                toast.success(
                  next ? `${lender.name || name} is now a trusted lender` : `${lender.name || name} is no longer a trusted lender`,
                ),
            )
          }
        />
      </label>
    </li>
  );
}
