import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { modules, newTest } from "../test.setup";
import { AUD_CONVEX, signToken } from "../lib/signing";

/*
 * The hosted deployment sets no N8N_TO_LENDLOOP_SECRET, so no token can be valid:
 * every signed /automation route must refuse, even for a token that would be valid
 * if a secret were set. (http.test.ts covers the same for one route; this is all four.)
 */

const SECRET = "test-secret-for-hosted-safety-0123456789";
let saved: string | undefined;
beforeEach(() => {
  saved = process.env.N8N_TO_LENDLOOP_SECRET;
});
afterEach(() => {
  if (saved === undefined) delete process.env.N8N_TO_LENDLOOP_SECRET;
  else process.env.N8N_TO_LENDLOOP_SECRET = saved;
});

describe("hosted deployment without N8N_TO_LENDLOOP_SECRET", () => {
  const routes: [string, string, Record<string, unknown>][] = [
    ["/automation/overdue-loans", "overdue:read", { asOf: "2026-03-10" }],
    ["/automation/reminders", "reminders:write", { results: [] }],
    ["/automation/notifications/ack", "notifications:write", { eventId: "e", loanId: "x", type: "request_created" }],
    ["/automation/failures", "failures:write", { workflow: "w", executionId: "e", message: "m" }],
  ];

  test.each(routes)("%s refuses every request", async (path, scope, claims) => {
    const t = newTest(modules);
    // Prove the token is otherwise good: it is accepted while a secret is set.
    process.env.N8N_TO_LENDLOOP_SECRET = SECRET;
    const token = await signToken({ scope, ...claims }, { secret: SECRET, audience: AUD_CONVEX });
    expect((await t.fetch(path, { method: "POST", body: JSON.stringify({ token }) })).status).not.toBe(401);

    delete process.env.N8N_TO_LENDLOOP_SECRET;
    for (const body of [JSON.stringify({ token }), JSON.stringify({}), "not json"]) {
      const res = await t.fetch(path, { method: "POST", body });
      expect(res.status, `${path} ${body.slice(0, 12)}`).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
    }
  });
});
