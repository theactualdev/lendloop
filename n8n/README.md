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

## Seeing it in the UI later

Nothing here needs an owner account. When you later start n8n and create the owner account, imported workflows and credentials are
assigned to the owner's personal project on first login and show up under Workflows and Credentials.

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
