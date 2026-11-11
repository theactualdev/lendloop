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

## Setup notes (for README)

- Make yourself admin after first sign-in (the user row is created by `ensureUser` on sign-in):
  `npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'`
