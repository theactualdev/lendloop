# n8n workflows

n8n 2.47.3 runs natively (global install, Node 24). Config lives in `.env.n8n` (git-ignored); run every CLI command as
`npx dotenv -e .env.n8n -- n8n <cmd>`.

## Conventions (every workflow)

- Settings -> Error workflow is set to "LendLoop · Error handler" (id `llErrorHandler01`; in JSON: `settings.errorWorkflow`).
- Every network node (HTTP Request, Send Email) has Retry On Fail enabled: 3 tries, 5 s apart.
- Nodes reference credentials by name (and id) only. No secret appears in workflow JSON.
- Non-secret config comes from `$env`: `LENDLOOP_CONVEX_SITE_URL`, `APP_URL`, `ADMIN_ALERT_EMAIL`.
- Credentials (create once): JWT "LendLoop → n8n" (`lendloopToN8n01`), JWT "n8n → LendLoop" (`n8nToLendloop01`),
  SMTP "Mailpit" (`mailpitSmtp00001`, host `127.0.0.1`, port 1025, TLS off, no auth).
- n8n -> Convex tokens: HS256, `aud: "lendloop-convex"`, a `scope`, plus `iat`, `exp` (iat + 300) and a unique `jti` in the claims JSON
  (the Sign node adds none itself). The token goes in the JSON body as `{ "token": ... }`.
- Record each drill's result below.

## Import and publish without the UI

Credentials: write a temp file outside the repo shaped like
`[{"id":"mailpitSmtp00001","name":"Mailpit","type":"smtp","data":{"user":"","password":"","host":"127.0.0.1","port":1025,"secure":false,"disableStartTls":true}}]`,
then `n8n import:credentials --input=<file>` and delete it. The JWT credentials (type `jwtAuth`, passphrase, HS256) are built the
same way from the values in `.env.secrets`; never commit or print them.

Workflows:

```
npx dotenv -e .env.n8n -- n8n import:workflow --input=n8n/workflows/error-handler.json
npx dotenv -e .env.n8n -- n8n publish:workflow --id=llErrorHandler01
```

A running n8n picks up a publish after about 15 s. `unpublish:workflow --id=<id>` deactivates. The CLI cannot delete workflows.
Import the error handler first; other workflows point to it.

## Owner account and the UI

The CLI steps above do not need an owner account, but claim it right after n8n's first start (README step 4): until an owner exists,
whoever reaches the editor first can claim it and use the stored credentials. `N8N_LISTEN_ADDRESS=127.0.0.1` keeps other machines
out. Imported workflows and credentials belong to the owner's personal project and show up under Workflows and Credentials.

## Workflows

### LendLoop · Error handler (`llErrorHandler01`)

Error Trigger -> Shape failure (Set: workflow name, execution id, failed node, error message with email-shaped text replaced by
`[redacted]` then cut to 500 chars, execution URL; no input data) -> two alert channels: Email admin (to `ADMIN_ALERT_EMAIL`,
subject `[LendLoop] Workflow failed: <name>`; the URL line is omitted when absent) and Sign failure token (JWT, `failures:write`)
-> Report to Convex (POST `/automation/failures`). In v1 execution order the channels run one after the other (by canvas position,
Email admin first), not in parallel. Each of Email admin, Sign failure token and Report to Convex is set to continue on error, so a
failure of one channel (after its 3 retries) cannot block the other. Convex upserts by `executionId` and redacts emails again.

## Drill results

### 2026-11-11 - error handler

Scratch workflow `Scratch · Error drill` (Webhook -> Code that throws; error workflow = the handler), published, called with curl.
Not committed; unpublished afterwards.

- Webhook call: 200; execution failed as intended.
- Mailpit: 1 message, subject `[LendLoop] Workflow failed: Scratch · Error drill`, to the admin address, from `lendloop@localhost`.
  Body held only workflow, execution id, failed node, redacted message, execution URL.
- Convex `automationFailures`: 1 row (executionId 5, node `Boom`), message stored as
  `SMTP rejected recipient [redacted]: mailbox unavailable [line 1]` (the thrown error contained an email address).
- Re-run: n8n cannot re-run a failed execution without the UI, so the identical signed failure claims (same `executionId`) were
  POSTed again: response `{"duplicates":1,"written":0}`, still one row for that execution id.
- A later call produced execution 7 and its own row, as expected (one row per execution).

### 2026-11-11 - fix round 1: channels are independent

Same scratch workflow, republished handler with `onError: continueRegularOutput` on both channels.

- Convex unreachable (n8n started with `LENDLOOP_CONVEX_SITE_URL=http://127.0.0.1:1`): webhook 200, Mailpit still received
  `[LendLoop] Workflow failed: Scratch · Error drill` (execution 9); no Convex row for execution 9.
- Mailpit stopped (n8n restarted normally): webhook 200, Convex got a row for execution 11
  (`SMTP rejected recipient [redacted]: mailbox unavailable [line 1]`).
- Scratch workflow unpublished afterwards; not committed.

### 2026-11-11 - request notification workflow (`llRequestNotif01`)

Workflow `LendLoop · Request notification`, built from `n8n/workflows/request-notification.json`, imported and published; the stored
version was exported and compared (nodes and connections identical). Evidence below comes from the Mailpit API and `npx convex data`/`run`.

1. Real request: two users, a tool and `loans:request` run with `npx convex run ... --identity`. Mailpit received
   `New request to borrow your Cordless Drill` to the lender within seconds (body: first name, tool, dates, `APP_URL/incoming`; no
   email address). The outbox row is `delivered`; an `automationEvents` row `notification_sent` / `request_created` exists and
   `loans:myRequests` for the borrower shows it in `activity`.
2. Replay: one token (signed with `jose`, secret read from `.env.secrets`, never printed) POSTed twice, 8 s apart: 202 and 202, one
   email for that `eventId`. Remove Duplicates keeps the key even when the first execution later fails (those test events used a
   made-up `loanId`, so the ack returned 400 and the error handler fired, which also showed that an ack failure surfaces).
3. Tamper (last characters of the signature changed): 401, no email.
4. Wrong audience (`aud: "lendloop-convex"`): 401, no email. Also 401 with no email: wrong scope, an expired token (the Verify node
   rejects it by itself), and a body without a token.
5. Mailpit stopped, then a real request: Send email retried, the execution failed, and the error handler wrote an `automationFailures`
   row (node `Send email`, message `The service refused the connection - perhaps it is offline`). Mailpit restarted afterwards.

Note: the n8n CLI `publish:workflow` can hang for minutes on this machine (slow database); n8n also takes a few minutes after
`n8n start` to register webhooks. Expect 404 from the webhook until then.

### LendLoop · Overdue reminders (`llOverdueRemind1`)

Daily 09:00 UTC (Schedule Trigger; workflow timezone UTC) or `Run now (manual)` -> Set asOf (today in UTC, `yyyy-MM-dd`) -> Sign
overdue token (JWT `overdue:read`, claims `asOf`) -> Fetch overdue loans (POST `/automation/overdue-loans`) -> Split loans -> Loop over loans (batch of 1) -> Send
reminder (Mailpit; retries 3 x 5 s, then `onError: continueErrorOutput`) -> `Mark sent` (success output) or `Mark failed` (error
output, `error` = first 200 chars of the error text) -> back to the loop; its done output -> Collect results (Aggregate into `results`)
-> Sign reminders token (JWT `reminders:write`) -> Write reminders to Convex (POST `/automation/reminders`) -> Any reminder failed? -> Reminders failed (Stop and Error, message `<N> of <M> reminders failed`, counts only), so any failed send makes the execution fail after the write-back and the error handler alerts the admin. The Set nodes read
`reminderKey` and `loanId` from `$('Loop over loans').first()`, which resolves on both outputs. `error` has email-shaped text replaced by `[redacted]` before it is cut to 200 chars.

Why the loop: with Retry On Fail plus an error output, n8n retries the whole node when the first item errors, which re-emailed the valid recipients (seen in a drill: 3 mails to one borrower). One item per run of Send reminder keeps a retry to that one recipient.

- One bad recipient does not stop the others: its send goes to the error output and is written back as `failed`; Convex redacts any
  email in `error`. A `failed` loan is offered again on the next run (only `reminder_sent` suppresses a loan), and a failed -> failed
  write is a duplicate, so reruns never add rows.
- Idempotent: the `reminderKey` is `reminder:<loanId>:<asOf>`; Convex upserts on it and only upgrades failed -> sent. Re-running the
  same day emails nobody who was already reminded.
- No overdue loans: Split loans yields zero items and the run ends there, with no write-back.
- Emails use only first name, tool name, end date, days overdue and `APP_URL/requests`. No address in the body, no lender identity.
- Limit: `/automation/reminders` accepts at most 500 results per call. A single run above that would get a 400 and write nothing.
  Batching is out of scope at this scale (a household-neighbourhood app).

### Request notification: unknown event types

`Route by type` has a fallback output wired to a Stop and Error node (`Unknown event type`), so an unrecognised `type` fails the
execution and the error handler fires, instead of the event vanishing.

## Runbook: a failed notification email is not retried by replay

Remove Duplicates in the request-notification workflow records an `eventId` as soon as it passes. If that execution then fails (email
refused, ack rejected), replaying the same `eventId` is dropped and will not resend the email or the ack. Recovery is manual: ask the
user to repeat the action (a new request, approval and so on creates a new event with a new `eventId`), or clear the dedupe history:
add a Remove Duplicates node set to "Clear Deduplication History" (scope: workflow) to a copy of the workflow, run it once from the UI,
and delete the copy. Nothing in the CLI clears it per key.

## Export, import, secret check

- `npm run n8n:export` runs `scripts/n8n-export.mjs`: it lists workflows with the CLI and exports only those named `LendLoop · …`, by
  id, into `n8n/workflows/` (`error-handler.json`, `request-notification.json`, `overdue-reminders.json`). Each file is one workflow object (n8n's native export is a one-item array with volatile metadata, which `import:workflow --separate` rejects as invalid), normalized by `normalizeWorkflow` to `id`, `name`, `nodes`, `connections`, `settings`, `staticData`, `meta`, `pinData`, `tags`; `active` is dropped. `node scripts/n8n-export.mjs --normalize` rewrites existing files without contacting n8n. It never uses `--all`, so
  `Spike …` and `Scratch …` workflows are not exported. It takes about two minutes (slow CLI); stop n8n first.
- `npm run n8n:import` imports every file in `n8n/workflows/` (`--separate`). Imports deactivate a workflow; publish again with
  `publish:workflow --id=<id>`. Import the error handler first.
- `npm run check:secrets` (`scripts/check-workflows.mjs [dir]`, or `CHECK_WORKFLOWS_DIR`) exits 1, printing file and variable name only,
  if a workflow JSON holds: a value (8+ chars, not a boolean or number) from `.env.local`, `.env.n8n` or `.env.secrets`; `sk_test_`,
  `sk_live_` or `-----BEGIN`; a node parameter named `secret`, `password` or `passphrase`; non-empty `pinData`; or an email-shaped
  string other than `lendloop@localhost`; or if a file is not a single object with a `nodes` array and a `connections` object (printing the file name only). Run it after every export.
- Running a workflow without the UI while n8n is up: `n8n execute --id=<id>` fails with "Task Broker's port 5679 is already in use"
  unless you give the CLI its own port: `N8N_RUNNERS_BROKER_PORT=5690 npx dotenv -e .env.n8n -- n8n execute --id=llOverdueRemind1`.
  It starts from the Manual Trigger and takes under a minute.

### 2026-11-11 - overdue reminders drills

Seed: `npx convex run seed:overdueLoan` (approved, unreturned, end date 3 days ago). Runs by `n8n execute` (see above). Evidence from
the Mailpit API and `npx convex data automationEvents` / `loans:myRequests --identity`.

1. `seed:overdueLoan '{"borrowerEmail":"riley@example.test"}'`, then a manual run: success. Mailpit got one message,
   `Reminder: please return the Overdue Test Drill`, to riley@example.test, from `lendloop@localhost` (body: first name, tool, end date,
   "3 days overdue", `APP_URL/requests`). `automationEvents` has `reminder_sent` for `reminder:<loanId>:2026-11-11`, and
   `loans:myRequests` for that borrower lists `{kind: "reminder_sent"}` in `activity`.
2. Second manual run the same day: success, ended at Split loans (zero items), no write-back. Mailpit still 1 message, no new event row.
3. Two overdue loans, one `sam@example.test` and one `not-an-email`: success. Mailpit got exactly one new message (to sam). Events:
   sam's loan `reminder_sent`, the other `reminder_failed` with detail `No recipients defined` (the other reminders still went out).
   A further run re-offered only the failed loan, sent nothing, and wrote no new rows (no duplicates). Note: that error text holds no
   address, so email redaction of `error` was not exercised in this drill (it is covered by Convex tests).
4. Fold-in: `Route by type` fallback re-imported and republished; the exported stored version shows `fallbackOutput: "extra"`.
5. Merge with only one branch active (drills 1 and 2) still reaches Aggregate, so the success-only and failure-only paths both write back.

### 2026-11-11 - fix round 1 drills

- `n8n execute` runs in mode `cli`, which does not fire the error workflow. The failure-surfacing drill therefore used an unpublished-afterwards copy
  (`Scratch · Overdue drill`, Webhook instead of the two triggers, same nodes and settings), published and called with curl.
- One valid (lee@example.test) and one invalid (`not-an-email`) overdue loan: lee got exactly one mail; the write-back happened
  (reminder_sent / reminder_failed rows); the execution failed at `Reminders failed` (`1 of 2 reminders failed`); the admin got
  `[LendLoop] Workflow failed: Scratch · Overdue drill`; `automationFailures` has a row for that execution.
- Before the loop was added, the same shape sent three mails to the valid borrower (retry re-ran the whole node). Fixed by the loop.
- Fallback: a signed token with valid aud/scope and `type: "something_else"` POSTed to the request webhook: 202; the run failed at
  `Unknown event type`; `automationFailures` row `Unknown loan event type: something_else`; no email to the recipient.
- `npm run n8n:export` with 7 workflows in n8n (Spike/Scratch present): exported 3 of 7, only the three `LendLoop · ` files, each ending in a newline.

Runbook: if `Write reminders to Convex` fails after emails were sent, nothing is recorded, so the next run emails those borrowers again.
The failed execution is surfaced by the error handler (admin email and `automationFailures` row).
