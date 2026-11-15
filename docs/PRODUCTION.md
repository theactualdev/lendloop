# Running LendLoop in production

The local setup is built for one laptop: an anonymous Convex local deployment, n8n from npm, Mailpit and a Clerk development instance. This note lists what I would change to run it for real, roughly in priority order within each group.

## Hosting and runtime

- **Convex:** a Convex Cloud production deployment (`npx convex deploy`), with its own env vars and secrets. The local deployment is a beta feature meant for development.
- **n8n:** n8n Cloud, or n8n in containers on Postgres in queue mode (a main instance plus workers, with Redis), behind HTTPS, with SSO on the editor. Not the global npm install used here: npm installs are deprecated from n8n 3.0. `N8N_ENCRYPTION_KEY` is backed up with the database; without it the credentials cannot be decrypted. Bind it to a private interface (`N8N_LISTEN_ADDRESS`) behind that HTTPS proxy, and set `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`, passing the config to workflows another way (n8n Variables, or values set at deploy time), so a Code node cannot read the process env.
- **Clerk:** a production instance on the app's own domain, with the Convex integration activated and the same session-token claims (`email`, `name`, `given_name`) set under Sessions → Customize session token (the setting is per instance, so it does not carry over from development), with a user-sync and deletion webhook into a Convex HTTP route (signature-checked), so name and email changes reach `users` and a deleted account's row is removed or anonymized.
- **Next.js:** any Node host or Vercel, pointing at the production Convex and Clerk instances.

## Messaging and secrets

- **Email:** a real provider (for example Postmark, SES or Resend) on a domain with SPF, DKIM and DMARC. Only the n8n SMTP credential changes. Add bounce and complaint handling.
- **User notification preferences:** let people choose which emails they get (for example reminders on or off) and check that in Convex before enqueuing.
- **Secrets in a manager** (1Password, Doppler, AWS Secrets Manager or similar), pushed to the Convex env and n8n credentials by CI, never typed by hand. Rotate them with a `kid` header on every JWS and two active keys per direction: sign with the new key, verify against both, then retire the old one.

## Protection

- **Rate limiting:** done for `loans.request`, `tools.create` and `users.setMyName` (Convex rate-limiter component, per member). Still open: limits on the other writes, and on the signed HTTP routes by IP.
- **CSP and security headers:** done in `next.config.ts` (see `lib/security-headers.ts`). For production, set `NEXT_PUBLIC_CONVEX_URL` and the Clerk live publishable key before `next build` so the policy names your real hosts, then click through sign-in with the console open. A nonce-based `script-src` (dropping `'unsafe-inline'`) is a later hardening step that makes pages dynamic.

## Observability

- **Alerting to Slack or PagerDuty:** a third channel in the error handler, plus alerts on outbox rows that are `failed` or stuck.
- **A heartbeat for scheduled workflows:** the overdue run records a run row in Convex (start, end, counts), and a Convex cron alerts if no run is recorded by 10:00 UTC. Today a run that never starts is silent.
- **Convex log streams** to a log platform (for example Axiom or Datadog), with retention and search.
- **An audit log of admin actions:** an append-only table for `removeListing`, `setTrustedLender`, `retryDelivery` and `setRole`, with who, what and when.

## Data and operations

- **Per-user time zones** for due dates, overdue and the reminder time. Today every day is a UTC date.
- **Retention:** done. A nightly Convex cron (`convex/retention.ts`) blanks the recipient's email and first name on delivered `outbox` rows after 7 days, deletes delivered rows after 90 days, and prunes `automationEvents` and `automationFailures` after 180 days. For production, review those periods against your privacy policy.
- **Batching for more than 500 reminders:** page `/automation/overdue-loans` with a cursor and write back one batch at a time, instead of one call capped at 500 results.
- **A per-loan delivery state when an email fails after the `202`:** n8n reports the failed send back to Convex (a failed ack), so the loan shows "Email didn't send" and an admin can resend it. The dedupe key would be cleared on failure, so a replay can deliver.
- **CI** on every push: `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:secrets`, a secret scanner such as gitleaks, and a workflow-JSON check (every workflow sets `errorWorkflow`, every network node retries, and credentials are referenced by id).
- **Backups:** scheduled Convex exports (`npx convex export`) and Postgres backups for n8n, with a tested restore.
