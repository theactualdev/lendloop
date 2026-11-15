"use client";

import { catchError, type ErrorInfo } from "next/error";
import { ListError } from "@/components/list-state";
import { errorCode } from "@/lib/errors";

/*
 * One error boundary per admin region, so a failing query shows its own error
 * state and the rest of the console keeps working. FORBIDDEN is different: it
 * means the viewer is not an admin, so it is thrown on up to the console's own
 * boundary, which swaps the whole page for "Not authorized". Convex is the
 * enforcement point; this is only the right way to show its refusal.
 *
 * Call at module scope: `const Boundary = adminSection("We couldn't load …")`.
 */
export function adminSection(title: string) {
  return catchError(function AdminSectionFallback(_props: object, { error, retry }: ErrorInfo) {
    if (errorCode(error) === "FORBIDDEN") throw error;
    return <ListError title={title} error={error} onRetry={retry} />;
  });
}
