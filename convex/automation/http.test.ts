import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { asUser, modules } from "../test.setup";
import { AUD_CONVEX, AUD_N8N, signToken } from "../lib/signing";

const SECRET = "test-secret-for-http-tests-0123456789";
const ASOF = "2026-03-10";

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.N8N_TO_LENDLOOP_SECRET;
  process.env.N8N_TO_LENDLOOP_SECRET = SECRET;
});
afterEach(() => {
  if (saved === undefined) delete process.env.N8N_TO_LENDLOOP_SECRET;
  else process.env.N8N_TO_LENDLOOP_SECRET = saved;
});

async function setup() {
  const t = convexTest(schema, modules);
  const alice = await asUser(t, { name: "Alice Anders", email: "alice@example.com" });
  const bob = await asUser(t, { name: "Bob Brown", email: "bob@example.com" });
  const toolId = await t.run((ctx) =>
    ctx.db.insert("tools", {
      ownerId: alice.userId,
      name: "Drill",
      category: "power_tools",
      condition: "good",
      description: "d",
      shortCode: "PWR 001",
      status: "active",
    }),
  );
  const loan = (status: "approved" | "returned" | "pending", startDate: string, endDate: string) =>
    t.run((ctx) =>
      ctx.db.insert("loans", {
        toolId,
        lenderId: alice.userId,
        borrowerId: bob.userId,
        startDate,
        endDate,
        status,
        ...(status === "returned" ? { returnedAt: 1 } : {}),
      }),
    );
  return { t, alice, bob, toolId, loan };
}
type T = Awaited<ReturnType<typeof setup>>["t"];

const mint = (scope: string, claims: Record<string, unknown> = {}, secret = SECRET, ttl?: number) =>
  signToken({ scope, ...claims }, { secret, audience: AUD_CONVEX, ttlSeconds: ttl });

async function post(t: T, path: string, token: string | undefined) {
  const res = await t.fetch(path, {
    method: "POST",
    body: JSON.stringify(token === undefined ? {} : { token }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, res };
}

const events = (t: T) => t.run((ctx) => ctx.db.query("automationEvents").collect());
const key = (loanId: string, date = ASOF) => `reminder:${loanId}:${date}`;

describe("automation http", () => {
  test("401 for missing, wrong-secret, expired, and wrong-scope tokens", async () => {
    const { t } = await setup();
    const routes: [string, string, Record<string, unknown>][] = [
      ["/automation/overdue-loans", "overdue:read", { asOf: ASOF }],
      ["/automation/reminders", "reminders:write", { results: [] }],
      ["/automation/notifications/ack", "notifications:write", {}],
      ["/automation/failures", "failures:write", {}],
    ];
    for (const [path, scope, claims] of routes) {
      const bad: Record<string, string | undefined> = {
        missing: undefined,
        garbage: "not-a-jwt",
        wrongSecret: await mint(scope, claims, SECRET + "x"),
        expired: await mint(scope, claims, SECRET, -120),
        wrongScope: await mint("something:else", claims),
      };
      for (const [name, token] of Object.entries(bad)) {
        const r = await post(t, path, token);
        expect(r.status, `${path} ${name}`).toBe(401);
        expect(r.body, `${path} ${name}`).toEqual({ error: "unauthorized" });
        expect(r.res.headers.get("content-type")).toContain("application/json");
      }
    }
    // Missing secret on the server is also an opaque 401.
    delete process.env.N8N_TO_LENDLOOP_SECRET;
    const r = await post(t, "/automation/overdue-loans", await mint("overdue:read", { asOf: ASOF }));
    expect(r).toMatchObject({ status: 401, body: { error: "unauthorized" } });
    // Non-JSON body is also 401.
    process.env.N8N_TO_LENDLOOP_SECRET = SECRET;
    const raw = await t.fetch("/automation/overdue-loans", { method: "POST", body: "nope" });
    expect(raw.status).toBe(401);
  });

  test("overdue excludes returned, not-yet-due, endDate == asOf, and already-reminded loans", async () => {
    const { t, loan } = await setup();
    const overdue = await loan("approved", "2026-03-01", "2026-03-07");
    const failedBefore = await loan("approved", "2026-03-01", "2026-03-08");
    await loan("returned", "2026-03-01", "2026-03-05");
    await loan("approved", "2026-03-08", "2026-03-20");
    await loan("approved", "2026-03-05", ASOF);
    await loan("pending", "2026-03-01", "2026-03-02");
    const reminded = await loan("approved", "2026-03-01", "2026-03-06");
    await t.run(async (ctx) => {
      await ctx.db.insert("automationEvents", {
        loanId: reminded,
        kind: "reminder_sent",
        idempotencyKey: key(reminded),
        at: 1,
      });
      await ctx.db.insert("automationEvents", {
        loanId: failedBefore,
        kind: "reminder_failed",
        idempotencyKey: key(failedBefore),
        at: 1,
      });
    });
    const r = await post(t, "/automation/overdue-loans", await mint("overdue:read", { asOf: ASOF }));
    expect(r.status).toBe(200);
    const loans = r.body.loans as { loanId: string; daysOverdue: number }[];
    expect(r.body.asOf).toBe(ASOF);
    expect(loans.map((l) => [l.loanId, l.daysOverdue]).sort()).toEqual(
      [
        [overdue, 3],
        [failedBefore, 2],
      ].sort(),
    );
  });

  test("overdue response objects have exactly the documented keys", async () => {
    const { t, loan } = await setup();
    const id = await loan("approved", "2026-03-01", "2026-03-07");
    const r = await post(t, "/automation/overdue-loans", await mint("overdue:read", { asOf: ASOF }));
    expect(Object.keys(r.body).sort()).toEqual(["asOf", "loans"]);
    const [l] = r.body.loans as Record<string, unknown>[];
    expect(Object.keys(l).sort()).toEqual(
      ["borrower", "daysOverdue", "endDate", "loanId", "reminderKey", "toolName"].sort(),
    );
    expect(l).toEqual({
      loanId: id,
      reminderKey: key(id),
      borrower: { email: "bob@example.com", firstName: "Bob" },
      toolName: "Drill",
      endDate: "2026-03-07",
      daysOverdue: 3,
    });
    // A bad asOf is a 400.
    for (const asOf of ["2026-02-30", "nope", 5, undefined]) {
      const bad = await post(t, "/automation/overdue-loans", await mint("overdue:read", { asOf }));
      expect(bad).toMatchObject({ status: 400, body: { error: "bad_request" } });
    }
  });

  test("reminder write-back is idempotent: same results twice → {written:1} then {duplicates:1}", async () => {
    const { t, loan } = await setup();
    const id = await loan("approved", "2026-03-01", "2026-03-07");
    const claims = { results: [{ reminderKey: key(id), loanId: id, status: "sent" }] };
    const first = await post(t, "/automation/reminders", await mint("reminders:write", claims));
    expect(first).toMatchObject({ status: 200, body: { written: 1, duplicates: 0 } });
    const second = await post(t, "/automation/reminders", await mint("reminders:write", claims));
    expect(second).toMatchObject({ status: 200, body: { written: 0, duplicates: 1 } });
    const rows = await events(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "reminder_sent", idempotencyKey: key(id), loanId: id });

    // Shape errors are 400 and write nothing.
    const other = await loan("approved", "2026-03-01", "2026-03-07");
    const badClaims: Record<string, unknown>[] = [
      { results: "x" },
      { results: Array.from({ length: 501 }, () => ({ reminderKey: key(id), loanId: id, status: "sent" })) },
      { results: [{ reminderKey: key(id), loanId: id, status: "nope" }] },
      { results: [{ reminderKey: key(other), loanId: id, status: "sent" }] },
      { results: [{ reminderKey: "reminder:zzz:2026-03-10", loanId: "zzz", status: "sent" }] },
    ];
    for (const c of badClaims) {
      const r = await post(t, "/automation/reminders", await mint("reminders:write", c));
      expect(r).toMatchObject({ status: 400, body: { error: "bad_request" } });
    }
    expect(await events(t)).toHaveLength(1);
  });

  test("failed→sent upgrades; sent→failed is ignored", async () => {
    const { t, loan } = await setup();
    const id = await loan("approved", "2026-03-01", "2026-03-07");
    const go = async (status: "sent" | "failed", error?: string) =>
      post(
        t,
        "/automation/reminders",
        await mint("reminders:write", {
          results: [{ reminderKey: key(id), loanId: id, status, ...(error ? { error } : {}) }],
        }),
      );
    expect((await go("failed", "x".repeat(400))).body).toEqual({ written: 1, duplicates: 0 });
    let [row] = await events(t);
    expect(row.kind).toBe("reminder_failed");
    expect(row.detail).toHaveLength(300);
    expect((await go("failed", "again")).body).toEqual({ written: 0, duplicates: 1 });
    expect((await go("sent")).body).toEqual({ written: 1, duplicates: 0 });
    [row] = await events(t);
    expect(row.kind).toBe("reminder_sent");
    expect((await go("failed", "late")).body).toEqual({ written: 0, duplicates: 1 });
    const rows = await events(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("reminder_sent");
  });

  test("ack twice → one notification_sent event; failures twice with same executionId → one row", async () => {
    const { t, loan } = await setup();
    const id = await loan("pending", "2026-03-01", "2026-03-07");
    const ack = await mint("notifications:write", { eventId: "ev-1", loanId: id, type: "request_created" });
    expect((await post(t, "/automation/notifications/ack", ack)).body).toEqual({ written: 1, duplicates: 0 });
    expect((await post(t, "/automation/notifications/ack", ack)).body).toEqual({ written: 0, duplicates: 1 });
    const rows = await events(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "notification_sent",
      idempotencyKey: "notify:ev-1",
      detail: "request_created",
    });
    const badAck = await mint("notifications:write", { eventId: "ev-2", loanId: id, type: "bogus" });
    expect((await post(t, "/automation/notifications/ack", badAck)).status).toBe(400);

    const f = await mint("failures:write", {
      workflow: "wf",
      executionId: "ex-1",
      node: "Send",
      message: "m".repeat(2000),
    });
    expect((await post(t, "/automation/failures", f)).body).toEqual({ written: 1, duplicates: 0 });
    const f2 = await mint("failures:write", { workflow: "wf", executionId: "ex-1", message: "other" });
    expect((await post(t, "/automation/failures", f2)).body).toEqual({ written: 0, duplicates: 1 });
    const fails = await t.run((ctx) => ctx.db.query("automationFailures").collect());
    expect(fails).toHaveLength(1);
    expect(fails[0].message).toHaveLength(1000);
    expect(fails[0].node).toBe("Send");
    const badFail = await mint("failures:write", { workflow: "wf", message: "x" });
    expect((await post(t, "/automation/failures", badFail)).status).toBe(400);
  });

  test("failure messages are stored with email addresses redacted", async () => {
    const { t } = await setup();
    const f = await mint("failures:write", {
      workflow: "wf",
      executionId: "ex-redact",
      message: "SMTP rejected bob@example.com: mailbox full (cc a.b+c@mail.example.org)",
    });
    expect((await post(t, "/automation/failures", f)).body).toEqual({ written: 1, duplicates: 0 });
    const fails = await t.run((ctx) => ctx.db.query("automationFailures").collect());
    expect(fails).toHaveLength(1);
    expect(fails[0].message).toBe("SMTP rejected [redacted]: mailbox full (cc [redacted])");
  });

  test("myRequests shows activity for the loan after a reminder write-back", async () => {
    const { t, bob, loan } = await setup();
    const id = await loan("approved", "2026-03-01", "2026-03-07");
    const ack = await mint("notifications:write", { eventId: "ev-9", loanId: id, type: "request_approved" });
    await post(t, "/automation/notifications/ack", ack);
    const rem = await mint("reminders:write", {
      results: [{ reminderKey: key(id), loanId: id, status: "sent" }],
    });
    await post(t, "/automation/reminders", rem);
    const mine = await bob.query(api.loans.myRequests, {});
    const view = mine.find((l) => l._id === (id as Id<"loans">));
    expect(view?.activity.map((a) => a.kind)).toEqual(["notification_sent", "reminder_sent"]);
    expect(view?.activity[0].detail).toBe("request_approved");
    for (const a of view!.activity) {
      expect(Object.keys(a).sort()).toEqual(a.detail === undefined ? ["at", "kind"] : ["at", "detail", "kind"]);
    }
    expect(view?.deliveryFailed).toBe(false);
  });

  test("wrong audience and cross-route scope are 401", async () => {
    const { t } = await setup();
    const wrongAud = await signToken(
      { scope: "overdue:read", asOf: ASOF },
      { secret: SECRET, audience: AUD_N8N },
    );
    expect((await post(t, "/automation/overdue-loans", wrongAud)).status).toBe(401);
    const ackToken = await mint("notifications:write", { eventId: "e", loanId: "x", type: "request_created" });
    const r = await post(t, "/automation/reminders", ackToken);
    expect(r).toMatchObject({ status: 401, body: { error: "unauthorized" } });
  });

  test("a mixed reminder batch with one bad item is 400 and writes nothing", async () => {
    const { t, loan } = await setup();
    const a = await loan("approved", "2026-03-01", "2026-03-07");
    const b = await loan("approved", "2026-03-01", "2026-03-07");
    const before = (await events(t)).length;
    const r = await post(
      t,
      "/automation/reminders",
      await mint("reminders:write", {
        results: [
          { reminderKey: key(a), loanId: a, status: "sent" },
          { reminderKey: "reminder:wrong:2026-03-10", loanId: b, status: "sent" },
        ],
      }),
    );
    expect(r).toMatchObject({ status: 400, body: { error: "bad_request" } });
    expect(await events(t)).toHaveLength(before);
  });

  test("an unknown but well-formed loanId is 400", async () => {
    const { t, loan } = await setup();
    const gone = await loan("approved", "2026-03-01", "2026-03-07");
    await t.run((ctx) => ctx.db.delete(gone));
    const rem = await post(
      t,
      "/automation/reminders",
      await mint("reminders:write", { results: [{ reminderKey: key(gone), loanId: gone, status: "sent" }] }),
    );
    expect(rem.status).toBe(400);
    const ack = await post(
      t,
      "/automation/notifications/ack",
      await mint("notifications:write", { eventId: "e1", loanId: gone, type: "request_created" }),
    );
    expect(ack.status).toBe(400);
    expect(await events(t)).toHaveLength(0);
  });

  test("ack rejects an eventId over 200 characters", async () => {
    const { t, loan } = await setup();
    const id = await loan("pending", "2026-03-01", "2026-03-07");
    const r = await post(
      t,
      "/automation/notifications/ack",
      await mint("notifications:write", { eventId: "e".repeat(201), loanId: id, type: "request_created" }),
    );
    expect(r.status).toBe(400);
  });

  test("a failed reminder's error never exposes an email through lender or admin views", async () => {
    const { t, alice, loan } = await setup();
    const admin = await asUser(t, { name: "Ada Admin", email: "ada@example.com", role: "admin" });
    const id = await loan("approved", "2026-03-01", "2026-03-07");
    const error = "550 5.1.1 <bob@example.com>: Recipient address rejected (smtp refused)";
    await post(
      t,
      "/automation/reminders",
      await mint("reminders:write", { results: [{ reminderKey: key(id), loanId: id, status: "failed", error }] }),
    );
    const stored = await events(t);
    expect(stored[0].detail).not.toContain("example.com");
    const views = JSON.stringify([
      await alice.query(api.loans.incoming, {}),
      await admin.query(api.admin.allLoans, {}),
    ]);
    expect(views).not.toContain("Recipient address rejected");
    expect(views).not.toMatch(/@|example.com/);
    const incoming = await alice.query(api.loans.incoming, {});
    expect(incoming[0].activity).toEqual([{ kind: "reminder_failed", at: expect.any(Number) }]);
  });
});
