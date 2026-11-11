import { Suspense } from "react";
import type { Metadata } from "next";
import { Board, BoardSkeleton } from "./board";

export const metadata: Metadata = {
  title: "The board · LendLoop",
};

/*
 * Screen D. The board reads `?category=` and `?from=&to=` with useSearchParams
 * in a client component, so it sits inside Suspense (Cache Components): the
 * shell prerenders and the board renders in the browser, behind the member
 * layout's provisioning gate.
 */
export default function BoardPage() {
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <Board />
    </Suspense>
  );
}
