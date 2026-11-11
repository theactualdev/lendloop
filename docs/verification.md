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

- [ ] **Brief Step 3, B:** sign in, open the board, pick A's Cordless Drill and free dates, then Request. Expected:
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
