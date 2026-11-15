# Running LendLoop in production

The local setup is built for one laptop: an anonymous Convex local deployment, n8n from npm, Mailpit and a Clerk development instance. This note lists what I would change to run it for real, roughly in priority order within each group.

## Hosting and runtime

- **Convex:** a Convex Cloud production deployment (`npx convex deploy`), with its own env vars and secrets. The local deployment is a beta feature meant for development.
- **n8n:** n8n Cloud, or n8n in containers on Postgres in queue mode (a main instance plus workers, with Redis), behind HTTPS, with SSO on the editor. Not the global npm install used here: npm installs are deprecated from n8n 3.0. `N8N_ENCRYPTION_KEY` is backed up with the database; without it the credentials cannot be decrypted.
- **Clerk:** a production instance on the app's own domain, with the Convex integration activated and the same session-token claims (`email`, `name`, `given_name`) set under Sessions → Customize session token (the setting is per instance, so it does not carry over from development), with a user-sync and deletion webhook into a Convex HTTP route (signature-checked), so name and email changes reach `users` and a deleted account's row is removed or anonymized.
- **Next.js:** any Node host or Vercel, pointing at the production Convex and Clerk instances.

## Messaging and secrets

- **Email:** a real provider (for example Postmark, SES or Resend) on a domain with SPF, DKIM and DMARC. Only the n8n SMTP credential changes. Add bounce and complaint handling.
- **User notification preferences:** let people choose which emails they get (for example reminders on or off) and check that in Convex before enqueuing.
- **Secrets in a manager** (1Password, Doppler, AWS Secrets Manager or similar), pushed to the Convex env and n8n credentials by CI, never typed by hand. Rotate them with a `kid` header on every JWS and two active keys per direction: sign with the new key, verify against both, then retire the old one.

## Protection

- **Rate limiting** on mutations, per user and per action (for example `loans.request` and `tools.create`), with the Convex rate-limiter component.
- **CSP and security headers** from Next.js: a Content Security Policy that allows only the app, Clerk and Convex origins, plus HSTS, `frame-ancestors 'none'`, `Referrer-Policy` and `Permissions-Policy`.

## Observability

- **Alerting to Slack or PagerDuty:** a third channel in the error handler, plus alerts on outbox rows that are `failed` or stuck.
- **A heartbeat for scheduled workflows:** the overdue run records a run row in Convex (start, end, counts), and a Convex cron alerts if no run is recorded by 10:00 UTC. Today a run that never starts is silent.
- **Convex log streams** to a log platform (for example Axiom or Datadog), with retention and search.
- **An audit log of admin actions:** an append-only table for `removeListing`, `setTrustedLender`, `retryDelivery` and `setRole`, with who, what and when.

## Data and operations

- **Per-user time zones** for due dates, overdue and the reminder time. Today every day is a UTC date.
- **Retention:** a Convex cron that drops the payload (the recipient's email) from delivered `outbox` rows after a few days and deletes old rows, and prunes `automationEvents` and `automationFailures` after a set period.
- **Batching for more than 500 reminders:** page `/automation/overdue-loans` with a cursor and write back one batch at a time, instead of one call capped at 500 results.
- **A per-loan delivery state when an email fails after the `202`:** n8n reports the failed send back to Convex (a failed ack), so the loan shows "Email didn't send" and an admin can resend it. The dedupe key would be cleared on failure, so a replay can deliver.
- **CI** on every push: `npm run typecheck`, `npm run lint`, `npm test`, `npm run check:secrets`, a secret scanner such as gitleaks, and a workflow-JSON check (every workflow sets `errorWorkflow`, every network node retries, and credentials are referenced by id). Strip the export metadata noise in `scripts/n8n-export.mjs`, or use n8n's source control.
- **Backups:** scheduled Convex exports (`npx convex export`) and Postgres backups for n8n, with a tested restore.
