"use client";

import { useState } from "react";
import { useQuery, type OptionalRestArgsOrSkip } from "convex/react";
import type { FunctionReference, FunctionReturnType } from "convex/server";

/**
 * useQuery that keeps showing the last result while new arguments load, so a
 * filter change dims the list instead of flashing the skeleton. `data` is
 * undefined only before the first result; `stale` is true while it is the
 * previous arguments' result. Errors still throw, for the nearest boundary.
 */
export function useStableQuery<Query extends FunctionReference<"query">>(
  query: Query,
  ...args: OptionalRestArgsOrSkip<Query>
): { data: FunctionReturnType<Query> | undefined; stale: boolean } {
  const result = useQuery(query, ...args);
  const [kept, setKept] = useState(result);
  if (result !== undefined && result !== kept) setKept(result);
  return { data: result ?? kept, stale: result === undefined && kept !== undefined };
}
