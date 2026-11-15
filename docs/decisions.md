# Decisions

## HS256 JWS between Convex and n8n (Task 2)

**Decision:** every Convex <-> n8n message is an HS256 JWT, built and checked by `convex/lib/signing.ts` (`jose`, algorithms pinned to `["HS256"]`, claims `aud`, `iat`, `exp` default 300s, `jti`). The Fallback (HMAC over the raw body in a header) was not needed.

| Direction | Audience | Secret (Convex env + `.env.secrets`) | n8n credential (type `jwtAuth`, passphrase, HS256) |
|---|---|---|---|
| Convex -> n8n | `n8n` | `LENDLOOP_TO_N8N_SECRET` | `LendLoop → n8n` |
| n8n -> Convex | `lendloop-convex` | `N8N_TO_LENDLOOP_SECRET` | `n8n → LendLoop` |

**Spike outcome (n8n 2.47.3, Convex local deployment):**
- Convex -> n8n: Webhook -> JWT node (Verify) -> Respond. Valid token 200, tampered token 401 (Verify node set to "On Error: Continue (using error output)" feeding a Respond to Webhook with code 401). A missing token also gives 401. The Convex local deployment can call `http://127.0.0.1:5678`.
- n8n -> Convex: Webhook -> JWT node (Sign, "Use JSON to Build Payload") -> HTTP Request with `Authorization: Bearer <token>` to a Convex HTTP route that calls `verifyToken` -> 200.
- Exported workflows reference credentials by name and id only; both secrets matched 0 times.

**Things later tasks must know:**
- n8n's JWT Verify node (jsonwebtoken) does NOT check `aud`. Add an IF node on `payload.aud` (and `payload.scope`) after Verify. Output is under `$json.payload`.
- n8n's Sign node does not add `iat`, `exp` or `jti` on its own in JSON mode. Put them in the claims JSON: `iat`/`exp` from `Math.floor(Date.now()/1000)` and a unique `jti`. `verifyToken` requires `exp` and `jti`.
- The secret is used as the raw passphrase string (UTF-8 bytes) on both sides, not base64-decoded.
- Credentials are created via `n8n import:credentials` (fixed ids `lendloopToN8n01`, `n8nToLendloop01`) from a temp file built from `.env.secrets`. Workflows are activated with `n8n publish:workflow --id=<id>`; a running n8n picks it up after about 15 seconds. `n8n unpublish:workflow` deactivates. Run CLI commands as `npx dotenv -e .env.n8n -- n8n <cmd>`.

**Remove Duplicates (`n8n-nodes-base.removeDuplicates`, typeVersion 2):** present in 2.47.3.
- Operation `removeItemsSeenInPreviousExecutions` ("Remove Items Processed in Previous Executions").
- Option `logic`: `removeItemsWithAlreadySeenKeyValues` ("Value Is New"); `dedupeValue` holds the key expression.
- Other logic values: `removeItemsUpToStoredIncrementalKey`, `removeItemsUpToStoredDate`.
- Options: `scope` (`workflow` or `node`), `historySize`.
- Other operations: `removeDuplicateInputItems`, `clearDeduplicationHistory` (mode `cleanDatabase`).

## Replays and opaque 401s (Task 8)

- Tokens expire after 5 minutes (`exp`). A replay inside that window is harmless because every n8n -> Convex route is an idempotent upsert (keyed on `reminderKey`, `notify:<eventId>` or `executionId`), so there is no `jti` store.
- Every verification failure returns the same `401 {"error":"unauthorized"}` with no detail: no jose message, no token, no secret in the response or logs. Claim-shape errors are a separate `400 {"error":"bad_request"}`, returned only after the signature is verified.

## Cache Components stay on; the landing page streams its live parts (Task 12)

**Decision:** keep `cacheComponents` and `partialPrefetching` on. No flag was turned off. `/` builds as a Partial Prerender (`◐ /` in `next build`): the header, hero copy and index-card frame are the static shell, and everything that depends on the request streams in behind its own `<Suspense>`:
- **Auth-dependent actions** (header button, hero button, card footnote) use Clerk's `<Show>`. In a server component it is async and calls `auth()`, which reads the request. Each one sits in a `<Suspense>` whose fallback is a same-height placeholder, so nothing shifts and signed-in visitors never see a "Sign in" flash.
- **Today's date** and **the shelf list** call `await connection()` first, so `Date.now()` and the Convex fetch run per request, never at build time. The build does not need Convex running.
- **The list** is server-rendered: `preloadQuery(api.tools.listPublic)` (no auth) in a server component, then `usePreloadedQuery` in the client `PublicToolList`, which stays live over the Convex websocket. A signed-out `curl /` contains the tool names.
- **Errors:** a failed preload is caught on the server and renders the error state, which works without JS. `catchError` from `next/error` wraps the list for errors from the live subscription; its `retry()` re-renders.

**Things later tasks must know:**
- Clerk 7 (Core 3) removed `<SignedIn>`, `<SignedOut>` and `<Protect>`; rendering them throws. Use `<Show when="signed-in">`, `"signed-out"`, `{ role: ... }` or `(has) => ...`, with `fallback` for the other branch. With Cache Components a server-side `<Show>` must be inside `<Suspense>`.
- `ClerkProvider` without `dynamic` does not read the request, so the root layout stays static. After a modal sign-in Clerk calls `router.refresh()`, so server `<Show>` output updates without a reload.
- `new Date()` or `Date.now()` in a server component needs `await connection()` before it.

## UI system (Task 12)

Every later screen reuses this. Do not add colours or fonts outside it.
- **Tokens:** `app/globals.css` holds every colour once, as `--ll-*` variables (the ten Decision 8 colours plus the supporting greys, paper and status colours found in the D/D1–D5 files). `@theme inline` exposes them to Tailwind as `ground`, `header`, `ink`, `violet`, `booked`, `free`, `alert`, `card-rule`, `card-line`, `paper`, `paper-back`, `paper-muted`, `tab`, `divider`, `leader`, `control`, `ink-soft`, `ink-quiet`, `ink-muted`, `ink-faint`, `ink-faded`, `disabled-ink`, `disabled-line`, `ok`, `ok-ink`, `alert-ink`, `alert-line`, `alert-wash` (so `bg-ground`, `text-ink-muted`, `border-card-rule`, ...). Shadows: `shadow-card`, `shadow-card-raised`, `shadow-card-lifted`.
- **shadcn mapping:** `--background` ground, `--foreground` ink, `--primary` violet, `--destructive` alert, `--border` border, `--input` control, `--ring` ink, `--card`/`--popover` paper, `--muted`/`--accent`/`--secondary` tab. `--radius` is 6px. The `.dark` block is gone and `dark:` only fires under a `.dark` class that is never set: there is no dark mode.
- **Fonts** (`next/font/google` in `app/layout.tsx`): Besley (`font-heading`, and the default for h1–h4), Public Sans (`font-sans`, body), IBM Plex Mono 500/600 (`font-mono`, codes, dates, catalog labels).
- **Focus:** one global style, a 3px ink outline offset 3px (from the design files).
- **Button** (`components/ui/button.tsx`, restyled): sizes `default` 44px, `lg` 48px, `xl` 56px (hero), `sm` 36px; variants `default` (violet), `outline-primary` (violet outline), `outline` (neutral, control border), `destructive` (alert outline), `secondary`, `ghost`, `link`.
- **Shared components:** `components/index-card.tsx` (`IndexCard` with `elevation`, `IndexCardHeader` with the red rule, `IndexCardTitle`), `components/wordmark.tsx`, `lib/dates.ts` (`dayLabels`, UTC).
- **Clerk** modals and the `UserButton` get the palette and Public Sans through `ClerkProvider appearance.variables` (CSS variables).

## Member shell and board (Task 13)

**Decision:** every member page lives under `app/(member)/`. Its layout renders `MemberHeader` (nav, "List a tool", `UserButton`) and wraps the page in `ProvisioningGate`, which runs `users.ensureUser` once per signed-in user as soon as `useConvexAuth().isAuthenticated`, and renders the page only after it resolves or once `users.viewer` is non-null. Member queries therefore never see "user not provisioned". Failures get a full-page state: Convex not accepting the Clerk token, and a token without the email claim, both point at the Clerk ↔ Convex integration. Other failures show `messageFor`. Only the error code is logged.

**Things later tasks must know:**
- **Shared pieces.** Use these, and do not fork them:
  - `components/availability-strip.tsx`: `AvailabilityStrip` (props `today`, `bookings`, `selection`, `availability`, `emphasis`, `label`, `size`), `StripScale` and `StripLegend` (`kinds`, `labels`, `emphasis`, extra `<li>` children). The cells come from the pure `stripCells` in `lib/strip.ts`, and `stripSummary` is the screen-reader text.
  - `components/stamp.tsx`: `Stamp`, with `tone` `date` | `alert` and `size` `sm` | `md` | `lg`. It is only for dates and alerts. Write the text in sentence case; CSS sets the caps.
  - `components/trusted-star.tsx`.
  - `components/ui/calendar.tsx`: react-day-picker 10, restyled, weeks start Monday. It understands the `booked` and `clash` modifiers.
- **Errors.** Show every error through `lib/errors.ts`: `messageFor(error)` for inline text, `toastError(error)` for toasts, `messageForCode(code)` for client checks that mirror a server rule. Raw server text is never shown. `<Toaster>` (sonner, restyled) is mounted once in `app/layout.tsx`.
- **Patterns in `globals.css`.** `bg-hatch-requested`, `bg-hatch-overdue`, `bg-hatch-clash` and `bg-ruled` (the index-card lines). Two derived colours are mixed from existing tokens, as the D file does: `bg-yours` and `bg-selected-wash`.
  - Clash is a crossed red hatch, so it never reads as overdue (the single hatch). D4 draws clash as the single red hatch; the shared strip uses the crossed one everywhere.
- **Days are UTC `YYYY-MM-DD`.** In client components, use `useTodayUtc()` (`lib/use-today.ts`) rather than `Date.now()` in render. The calendar maps days to local Dates through `dayToLocalDate`/`localDateToDay`, so a time zone never moves a day.
- **URL state.** The board writes `?category=` with `history.pushState` and `?from=&to=` with `history.replaceState`. Next syncs these into `useSearchParams` without a server round trip, but **a render later**. So build the next URL from `window.location` in event handlers, never from the current render's params. Bad params are dropped (`readBoardParams`) and cleaned from the address bar, with no toast.
- **Date rules on the client.** `isRequestableRange` runs the backend's own `validateRange`, so the client and the server cannot drift apart.
- **One ask per borrower, tool and day (fix round 1).**
  - `loans.request` fails `ALREADY_REQUESTED` when the same borrower already has a pending, or approved and unreturned, loan on the same tool that overlaps the dates. This stops a double click from emailing the lender twice. It is still allowed after a decline or a cancel.
  - The card mirrors the rule with `alreadyAsked` (`lib/tool-status.ts`) and reads "Requested" after a send until the tool or the dates change.
  - `NO_EMAIL_CLAIM` in `convex/lib/errors.ts` is the one shared string behind `isMissingEmailClaim`.
- **Names.** A missing first name goes through `neighborName` (`lib/names.ts`): "your neighbor" (or "Your neighbor" to start a sentence), and "a neighbor" for labels like "Lent by…".
- **Lists.** Every `<ul>` has `role="list"`. Each region that runs a query sits in its own `catchError` boundary. `useStableQuery` keeps the last result while new args load.

## My listings, My requests, Incoming and activity (Task 14)

**Decision:** the three member screens read per-member data in the browser behind the gate. Each page is a thin server `page.tsx` (metadata only) that renders one client component; every region that runs a query sits in its own `catchError` boundary, with the shared loading / empty / error states in `components/list-state.tsx`.

- **Pure helpers (Vitest):** `lib/activity.ts` (`activityText`, `latestActivity`, `formatActivityTime`), `lib/tool-form.ts` (`validateTool`, which mirrors `convex/tools.ts`), `lib/loan-step.ts` (`requestStep`, `daysLate`) and `weekdayDay` in `lib/dates.ts`. Raw activity `detail` is only ever matched against the five event types; anything else reads "Email sent".
- **Listings.** `/listings`; the header's "List a tool" links to `/listings#list-a-tool` and the page focuses the Name field (also on `hashchange`). One `components/tool-form.tsx` creates and edits. Remove is an `alert-dialog` (shadcn, restyled to the tokens). It is disabled while a loan is out, and the borrower's first name comes from `loans.incoming()` approved items joined by `tool.shortCode`.
- **Incoming strips.** Each waiting request's strip is that tool's `myListings` bookings (joined by short code) with this request's own `requested` entry removed once, plus the request's dates as `yours` (emphasis). Approve is disabled, with the reason, when `clash` is set.
- **Stamps.** Dates and alerts only. My requests: pending and approved carry the date range (or "Due Nov 14" while held), overdue and declined carry an alert stamp, and returned / cancelled are plain mono text.
- **Activity.** `ActivityLine` (latest event, `formatDistanceToNow`) is in Your loans; the full list is the Activity slip on My requests. Times are shown in the viewer's own time zone, days elsewhere stay UTC.
- **Mutations.** One in flight per card (a ref plus `busy`), success toasts, errors through `toastError`.

## Setup notes (for README)

- Make yourself admin after first sign-in (the user row is created by `ensureUser` on sign-in):
  `npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'`
