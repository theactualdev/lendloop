# Verification log

One section per UI task. Each lists what was checked when the task was built, and the
browser click-throughs still owed in the user session (Task 16). The plan's accounts:

- **A**: lender (lists tools, approves requests)
- **B**: borrower (requests A's tools)
- **C**: admin (`users:setRole`)

## Task 12: Public landing page (`/`)

### Verified at build time (2026-11-11)

Local stack: Convex local deployment (`npx convex dev`) and `next start` on a production build, `seed:demo` loaded.

| Check | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | clean |
| Lint | `npm run lint` | clean |
| Build | `npm run build` | passes with `cacheComponents` and `partialPrefetching` on; `◐ /` (Partial Prerender) |
| Signed-out render | `curl -s http://localhost:3000/` | 200; contains "LendLoop", the tagline, "Sign in to lend or borrow", "On the shelf now", "Neighbors only see your first name." and all 10 seeded tool names |
| No owner data on `/` | grep the same HTML for seeded owner names, `example.test`, `ownerId`, `shortCode` | 0 matches; the preloaded payload holds only `{category, name}` objects |
| Protected route | `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:3000/board` | `307` to the Clerk sign-in page with `redirect_url=/board` |
| Brief Step 2 (by CLI) | `npx convex run tools:listPublic` | 10 rows; the only key set is `category,name` |
| Error state | stop Convex, `curl /` | 200; card shows "We couldn't reach the shelf." with Try again. Restart Convex, click Try again: the list comes back |

Signed-out browser pass (built-in browser, no sign-in): layout matches D1 at 1280px; no horizontal scroll at 360px; "Sign in to lend or borrow" opens the Clerk modal (themed violet); Tab reaches the header button, then the hero button, with the 3px ink outline; fonts load (Besley, Public Sans, IBM Plex Mono 500/600); list rows read as "Claw Hammer, Hand tools" to assistive tech.

### Owed in the user session (Task 16)

Items ticked below were done in the 2026-11-15 end-to-end pass (golden path and admin checks; see "Task 16: end-to-end verification (2026-11-15)" at the end). Unticked items are NOT verified yet.

- [ ] **Signed out, DevTools (brief Step 2):** on `/`, the `tools:listPublic` websocket result holds only `name` and `category`, and no other Convex query runs.
- [ ] **A:** signs in from "Sign in to lend or borrow" (modal). The page updates without a reload: the hero shows "Go to the board", the header shows the account button, the card footnote changes. "Go to the board" opens `/board`.
- [ ] **A:** lists a new tool; it appears on the signed-out landing page in another window without a reload (live list).
- [ ] **B:** once A approves B's request and the loan starts today, that tool leaves the public list; after A marks it returned, it comes back.
- [ ] **C:** removes a tool in admin; it leaves the public list.
- [ ] **Empty state:** with no listable tools, the card reads "The shelf is empty right now."
- [ ] **Phone (360px) and keyboard-only pass** on a real device or emulator, signed out and signed in.

## Task 13: Member shell and board (`/board`)

### Verified at build time (2026-11-11)

Local stack: Convex local deployment (`npx convex dev`), `seed:demo` loaded. `next dev` for the harness, then `next start` on a fresh production build.

| Check | Command | Result |
|---|---|---|
| Types | `npm run typecheck` | clean |
| Lint | `npm run lint` | clean |
| Tests | `npm test` | 245 passed (16 files). New: `lib/strip.test.ts` 21, `lib/errors.test.ts` 22, `lib/board-params.test.ts` 20, `lib/tool-status.test.ts` 12, `lib/dates.test.ts` 8 |
| Build | `npm run build` | passes with `cacheComponents` and `partialPrefetching` on; `○ /board` (static shell, the board renders client-side behind the provisioning gate), `◐ /` |
| Signed-out `/board` | `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:3000/board` | `307` to Clerk sign-in, `redirect_url=/board`; with `?from=&to=` the query is kept in `redirect_url`. `x-clerk-auth-status: signed-out` |
| Other member routes | curl `/listings`, `/requests`, `/incoming`, `/admin` | `307` each |
| `/` still renders | `curl http://localhost:3000/` | 200; "Sign in to lend or borrow", "On the shelf now", seeded tool names; no error state |
| Board's query args | `npx convex run tools:list '{"from":"2026-11-12","to":"2026-11-14"}' --identity '{"issuer":"demo","subject":"ben"}'` | 16 cards with `bookings`, `availability`, `isMine`, `freeInRange`; reversed dates give `INVALID_RANGE` |

Visual harness (a throwaway route with fixture `ToolCard`s, deleted before the commit), built-in browser:
- **1280px:**
  - Composition matches screen D: header and nav, the date eyebrow and "The board", the search, the "When do you need it?" bar, the catalog-divider tabs joined to the list, rows with code, name, lender and star, the strip with the violet band (solid on the picked row), and a status (green "Free Nov 12–14", "Back Nov 14" date stamp, "Overdue" alert stamp, "You asked for…", "Request waiting").
  - The legend and the index-card side panel: header, ruled lines, calendar, "Nov 12 – 14" stamp, "Request Nov 12 – 14", the next-step line.
  - "Your loans".
- **360px:**
  - `scrollWidth` is 360 (no horizontal page scroll).
  - The rows stack: code above name, status on the right, a 294px strip under them.
  - The side panel stacks under the list.
  - Header: wordmark and "List a tool" on one row, nav below.
- **URL state:**
  - `?category=boats&from=2026-11-01&to=2026-11-03` → both are dropped, the address bar is cleaned to `/board`, no toast.
  - `&junk=1` is removed.
  - A category click pushes `?category=`, and Back restores the previous tab.
  - Calendar clicks write `?from=&to=` and the date fields follow.
  - Rapid clicks keep both params, because handlers read `window.location`.
- **Date bar:**
  - A past start shows "Pick dates from today onward, up to 30 days." inline, with `aria-invalid` and `aria-describedby`, and the board drops its dates. No toast.
  - The same happens for a range longer than 30 days.
  - A valid pair writes the URL and keeps the fields.
- **Calendar (keyboard):**
  - Click the 16th, ArrowRight ×2, Enter → "Request Nov 16 – 18".
  - Roving tabindex, and the 3px ink focus outline.
  - Past days are disabled with labels like "Thursday, November 5"; today reads "Today, Wednesday, November 11".
- **Error states** (the harness was signed out, so member queries threw `UNAUTHENTICATED`):
  - The list shows "We couldn't load the board." with `messageFor`'s sentence and Try again.
  - "Your loans" shows its own error.
  - The card falls back to "Pick a tool".
- **Toasts:**
  - Success: paper, ok-ink title, Public Sans, 4px corner, card shadow.
  - Error: alert ink with the alert-line border, text from `messageFor`.
  - The pane was hidden, so the entry animation did not run on screen. Styles were checked as computed values.
- **Screen-reader text:** each strip reads, for example, "Next three weeks: Booked today to Nov 14; your dates Nov 16 to 18; free otherwise."

### Owed in the user session (Task 16)

Items ticked below were done in the 2026-11-15 end-to-end pass (golden path and admin checks; see "Task 16: end-to-end verification (2026-11-15)" at the end). Unticked items are NOT verified yet.

- [x] **Brief Step 3, B:** sign in, open the board, pick A's Cordless Drill and free dates, then Request. Expected:
  - a "Request sent to Ada" toast;
  - the loan appears in B's requests (the board's "Your loans" right away, and `/requests` once Task 14 lands);
  - an email in Mailpit.
- [ ] **Brief Step 3, B:** type a past start date. Expected: "Pick dates from today onward, up to 30 days." under the date bar, and no request can be sent.
- [ ] **New user, first sign-in:** a short loading state, then the board. The console shows no "user not provisioned".
- [ ] **A:** on their own tool, Request is disabled with "This is your own tool, so you can't request it." The row says "Your listing" and, once B has asked, "Request waiting". The Incoming badge shows the count.
- [ ] **B, clash:** pick dates that overlap an approved loan. Expected:
  - the crossed red hatch in the strip;
  - the clash note in the card;
  - the request still sends;
  - A's Approve is blocked (Task 14).
- [ ] **B, on-loan tool:** a tool on loan can be requested for dates after "Back …".
- [ ] **B, no double ask (fix round 1):** after "Request sent", the button reads "Requested" until the dates change. Picking the same or overlapping dates again shows "Already requested" with the reason. Mailpit gets one email, not two.
- [ ] **Signed out in another tab (fix round 1):** the open board shows "You're signed out" with a Sign in button.
- [ ] **C:** sees Admin in the nav; A and B do not.
- [ ] **Gate failure (optional drill):** with the Clerk "convex" JWT template off, `/board` shows "We couldn't connect your account".
- [ ] **Toasts:** the slide-in animation, seen with the pane visible.
- [ ] **Devices:** a phone at 360px, a keyboard-only pass signed in, and VoiceOver in Safari reading the lists as lists.

## Task 14: My listings, My requests, Incoming, activity (`/listings`, `/requests`, `/incoming`)

### Verified at build time (2026-11-11)

| Check | Result |
|---|---|
| Types, lint | `npm run typecheck` and `npm run lint` clean |
| Unit tests | `npm test`: 20 files, 285 tests pass (new: `lib/activity`, `lib/tool-form`, `lib/loan-step`, `weekdayDay` in `lib/dates`) |
| Build | `npm run build` passes |
| Signed-out redirect | `next start`: `/listings`, `/requests`, `/incoming` each answer `307` to the Clerk sign-in page |
| Throwaway fixture harness | not run (optional); layout is unverified in a browser and is covered by the Task 16 pass |

### Owed in the user session (Task 16)

Items ticked below were done in the 2026-11-15 end-to-end pass (golden path and admin checks; see "Task 16: end-to-end verification (2026-11-15)" at the end). Unticked items are NOT verified yet.

Brief Step 4 click-through, with A (lender), B (borrower) and C (admin):

- [ ] **A, listings (D2):** `/listings` shows A's tools with strips. "List a tool" in the header lands on the card with Name focused. Create a tool: counter reads `n / 280`, a toast says "Listed …", the row appears. Edit it: the card becomes "Edit tool" and saves. Bad input (1-character name, 281-character description) shows inline errors before any request.
- [ ] **A, remove:** Remove opens the confirm dialog (focus stays inside; Escape closes). Confirm removes the tool and a toast says so. A tool with a waiting request says how many requests will be declined.
- [x] **B → A, request:** B requests A's tool from the board. A's header badge counts it; `/listings` shows "1 request waiting · Review"; `/incoming` shows it under "Waiting for you" with the violet asked-for dates on A's strip.
- [ ] **A, clash:** with an approved loan on the tool, a second request that overlaps it shows "Clashes with <name>'s loan until <date>" and Approve is disabled; Decline works.
- [x] **A, approve:** Approve moves the request to "Out on loan" and B is emailed (Mailpit). `/listings` now shows "Back <date>", "with <B>" and Remove disabled with "You can remove it once <B> has returned it".
- [x] **B, requests (D3):** the request is under Active with its stamp, the next step ("Pick it up from <A> on …") and an Activity slip listing each email with date and time. Cancel is only on a pending request, and works once (no double toast on a double click).
- [x] **A, return:** Mark returned moves it to "Recently". B's card moves to Past.
- [x] **Overdue:** with an overdue loan, A sees the "Overdue" stamp in Out on loan and on the listing; B sees "Overdue" and "This was due back …".
- [ ] **Delivery failure:** with a failed outbox row, the lender sees "Email didn't send. An admin can resend it."
- [x] **Activity line, live:** on the board, B's "Your loans" shows e.g. "Reminder sent 2 days ago". Run the n8n reminder; the line updates with no reload.
- [ ] **C:** sees the same screens for their own data only.
- [ ] **Devices:** 360px phone (no horizontal page scroll; only a strip scrolls inside its box), keyboard-only pass, and VoiceOver reading the lists as lists.

## Task 15: Admin console (`/admin`) and Task 14 polish

### Verified at build time (2026-11-15)

| Check | Result |
|---|---|
| Types, lint | `npm run typecheck` and `npm run lint` clean |
| Unit tests | `npm test`: 21 files, 306 pass (new: `lib/admin`, 21 tests, written RED then GREEN) |
| Build | `npm run build` passes after the last edit (`○ /admin`) |
| Signed-out redirect | `next start`: `/admin` and `/listings` each answer `307` to the Clerk sign-in page |
| Task 14 polish | (i) the `loans.incoming` join has its own boundary, so a failing query no longer errors the whole list; (ii) Remove is disabled until the join has resolved; (iii) the `n / 280` counter uses the trimmed length; (iv) after a successful remove, focus goes to the list heading; (v) editing state clears if the edited tool disappears; (vi) field errors are `aria-live="polite"`. Typecheck and lint only; behaviour is covered by the Task 16 pass |
| Browser | not run; layout at 1280 and 360px is unverified and covered by Task 16 |

### Owed in the user session (Task 16)

Items ticked below were done in the 2026-11-15 end-to-end pass (golden path and admin checks; see "Task 16: end-to-end verification (2026-11-15)" at the end). Unticked items are NOT verified yet.

Brief Step 2 click-through, with A (lender), B (borrower) and C (admin). Run `npx convex run seed:demo` first for data.

- [x] **B, not authorized:** B opens `/admin` directly. Expected: "Not authorized" with a "Back to the Board" link, no admin data shown. The nav has no Admin item for B.
- [x] **C, remove A's tool:** B has a pending request on A's tool. C opens `/admin`, Listings, Remove on that tool, adds a reason (counter reads `n / 280` on the trimmed text; over 280 disables Remove tool), confirms. Expected: toast "Removed …"; B's request becomes declined and B gets an email (Mailpit). A loan already out on another tool is unchanged.
- [ ] **C, all loans:** tabs All, Pending, Approved, Overdue and Closed filter the table; counts match; Last email shows relative time, a failed email in red with a "Failed" stamp.
- [ ] **C, needs attention:** with a failed outbox row, "Retry now" is disabled while it runs and the row leaves the list on success; a stale pending row is listed under "Stuck in the queue" with Retry now (same lock as failed rows); a workflow failure shows workflow, node and a redacted message; an overdue loan shows its reminder count; the reminders line reads "Today's reminders: N sent, M failed" or the "No reminders recorded today" line.
- [x] **C, trusted lenders:** the switch toggles with a toast, is disabled while pending, and the star appears next to that lender on the board.
- [ ] **Names only:** no email address appears anywhere on `/admin`.
- [ ] **Devices:** 360px (no horizontal page scroll; the loans table scrolls inside its box), a keyboard-only pass (focus visible on tabs, switches, dialog), VoiceOver reading the table with its headers.

## Task 16: end-to-end verification (2026-11-15)

Accounts: A = Gbolahan (lender), B = Damilola (borrower), C = Olayinka (admin), all real Clerk users. Demo data: Ada, Ben, Cleo, Dev
(`demo|<slug>`, `@example.test`). Stack: `npm run dev:all` on Windows (Next 16, Clerk, Convex 1.49 local, n8n 2.47.3, Mailpit 1.33.1).

### Step 1: from scratch

Stack stopped, `.convex/` and `.n8n/` wiped, README followed from scratch. PASSED; the fixes found on the way were committed along the way.

### Step 2: golden path and admin (browser, real users)

PASSED.

- List a tool -> B requests (email to A) -> A approves (email to B) -> overdue via `seed:overdueLoan` -> reminder workflow (email and
  `reminder_sent` activity) -> A marks returned (email to B).
- Admin: B gets "Not authorized" on `/admin`. C removed the Screwdriver with a reason; B's pending request on it was auto-declined and B got
  a decline email. A was set as a trusted lender.
- Drill "reminder workflow run twice sends no duplicates" (D4): PASSED. Run 2 ended at "Split loans" with 0 items; the reminder email count
  stayed at 1.

### Step 3: failure drills

All drills used demo users through the Convex CLI (`loans:request --identity '{"issuer":"demo","subject":"ben"}'`), so no real address
was involved. Times are UTC.

**D1. n8n down during a request: PASSED**

1. Stopped the n8n process tree; `/healthz` then gave no connection.
2. 17:00:15 Ben requested Ada's Cordless Drill (2026-12-20 to 12-22). Outbox row `request_created`, status `pending`.
3. `npx convex data outbox`:
   - attempt 1 (17:00:15): `attempts=1`, `lastError` = `TypeError: error sending request for url (http://127.0.0.1:5678/webhook/lendloop/loan-events): client error (Connect): tcp connect error: No connection could be made because the target machine actively refused it. (os error 10061)`.
   - attempt 2 (30 s later, about 17:00:45): `attempts=2`, same error. Attempt 3 (2 min later, about 17:02:45): `attempts=3`, same error.
4. n8n restarted at 17:03:43; `/healthz` 200 at 17:08:23 and the webhook answered 401 to an empty POST at 17:08:34 (webhooks register a few minutes after start).
5. The 10-minute retry slot ran at about 17:13:05: row `delivered` (`attempts=3`, `lastError` cleared). Mailpit: one message "New request to borrow your Cordless Drill" to ada@example.test. `automationEvents`: `notification_sent` / `request_created`, key `notify:<outbox eventId>`.

Not drilled live: "after 5 failures the row shows in admin health and Retry works". It needs about 72 minutes of n8n downtime (30 s + 2 min + 10 min + 1 h of backoff before the 5th failure), so it is covered by the Convex tests in `convex/automation/outbox.test.ts` instead: "non-2xx reschedules with the next delay; 5th failure sets status 'failed'" and "retryDelivery is admin-only and re-queues a failed row". The admin-health listing of a failed row and the Retry button in the browser are therefore not verified live.

**D2. Bad signatures in both directions return 401: PASSED**

A throwaway node script outside the repo (deleted afterwards, never committed) signed tokens with `jose`, reading `.env.secrets` without printing it.

| Target | Token | Status |
|---|---|---|
| n8n `/webhook/lendloop/loan-events` | wrong secret | 401 |
| | tampered (one signature character changed) | 401 |
| | correct secret, `aud: "lendloop-convex"` | 401 |
| | expired (iat 20 min ago, exp 15 min ago) | 401 |
| Convex `/automation/failures` | wrong secret / wrong scope / `aud: "n8n"` / iat 6 min old | 401 `{"error":"unauthorized"}` each |
| Convex `/automation/notifications/ack` | wrong secret / wrong scope / `aud: "n8n"` / iat 6 min old | 401 `{"error":"unauthorized"}` each |

No email was sent for the n8n cases (the 401 is returned before the workflow runs).

**D3. A duplicate webhook produces one email: PASSED**

One valid token (`aud: "n8n"`, `scope: "loan-event"`, payload matching `convex/automation/payload.ts`, fresh `eventId`, a real loanId, recipient dev@example.test) was POSTed twice, 1 s apart: 202 and 202. Mailpit: exactly 1 message to dev@example.test, "New request to borrow your Cordless Drill". `automationEvents`: exactly one row with key `notify:<eventId>` (the ack succeeded).

**D4. Reminder workflow twice: PASSED** (from Step 2, above).

**D5. Mailpit down, the error workflow's Convex write still lands: PASSED**

1. Mailpit tree stopped (`:8025` gave no connection). `automationFailures` had 0 rows.
2. 17:13:35 Ben requested Ada's Orbital Sander (2026-12-24 to 12-26). The outbox row went `delivered` at once (n8n accepted the webhook).
3. n8n's Send email retried 3 times and failed; the execution failed and the error handler ran. Its admin email also cannot send with Mailpit down.
4. 17:13:57 `npx convex data automationFailures`: 1 new row: workflow `LendLoop · Request notification`, execution 19, node `Send email`, message `The service refused the connection - perhaps it is offline`. So the Convex channel landed while the email channel could not.
5. Mailpit restarted; `http://127.0.0.1:8025` answered 200.

What an admin sees: `admin.automationHealth` `workflowFailures` is fed from the same table, so this row (workflow, node, redacted message, time) is what Needs attention lists. It was read through `npx convex data`, not in the browser.

### Step 4: final checks

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm test` | 21 files, 318 tests passed |
| `npm run check:secrets` | 3 workflow files clean |
| `gitleaks detect --source . --redact` (v8.30.1, git history) | 41 commits scanned, no leaks found |
| `gitleaks dir .` (working tree; node_modules, .next, .convex, .n8n, .tools, .superpowers excluded) | 3 findings, all in git-ignored local env files (`.env.local` x2, `.env.secrets` x1; not tracked, not in history). Expected: they hold the real local keys |
| `npm run build` | NOT run. Deferred until the stack is stopped (`next dev` is running) |

### Still not verified

- Signed-in screenshots for the README.
- The final `npm run build`.
- The other unticked "Owed" items above: signed-out DevTools check, live landing-page updates, empty state, board clash and double-ask behaviour, listings create/edit/remove UI, the delivery-failure message to a lender, 360px and keyboard/VoiceOver passes.
- Admin health with a failed outbox row and the Retry button in the browser (see D1; covered by Convex tests only).
