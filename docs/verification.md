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
