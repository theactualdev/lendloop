import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import { asUser, modules, newTest } from "../test.setup";
import { todayUtc } from "../lib/availability";
import { BREVO_URL } from "./brevo";
import type { Id } from "../_generated/dataModel";
import { MAX_PER_RUN } from "./reminders";
import { reminderEmail } from "./templates";

const DAY = 86_400_000;
const ENV = ["EMAIL_TRANSPORT", "BREVO_API_KEY", "MAIL_FROM", "MAIL_FROM_NAME", "APP_URL", "ADMIN_ALERT_EMAIL"];
const APP_URL = "https://lendloop.example.test";
const ASOF = todayUtc();
const daysAgo = (n: number) => todayUtc(Date.now() - n * DAY);

let savedEnv: Record<string, string | undefined>;
beforeEach(() => {
  savedEnv = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  process.env.EMAIL_TRANSPORT = "brevo";
  process.env.BREVO_API_KEY = "xkeysib-test-key-0123456789";
  process.env.MAIL_FROM = "demo@lendloop.example.test";
  process.env.APP_URL = APP_URL;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [k, val] of Object.entries(savedEnv)) {
    if (val === undefined) delete process.env[k];
    else process.env[k] = val;
  }
});

async function setup() {
  const t = newTest(modules);
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
  const overdue = (endDate: string, extra: { returnedAt?: number } = {}) =>
    t.run((ctx) =>
      ctx.db.insert("loans", {
        toolId,
        lenderId: alice.userId,
        borrowerId: bob.userId,
        startDate: daysAgo(10),
        endDate,
        status: "approved",
        ...extra,
      }),
    );
  return { t, overdue };
}
type T = Awaited<ReturnType<typeof setup>>["t"];
const events = (t: T) => t.run((ctx) => ctx.db.query("automationEvents").collect());
const failures = (t: T) => t.run((ctx) => ctx.db.query("automationFailures").collect());
const run = (t: T) => t.action(internal.email.reminders.sendDirectReminders, {});

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}
const ok = async () => new Response("{}", { status: 201 });
const bodies = (fn: ReturnType<typeof stubFetch>) => fn.mock.calls.map((c) => JSON.parse(c[1].body as string));

describe("direct overdue reminders", () => {
  test("do nothing when EMAIL_TRANSPORT is unset or n8n", async () => {
    for (const value of [undefined, "n8n"]) {
      const { t, overdue } = await setup();
      await overdue(daysAgo(2));
      if (value === undefined) delete process.env.EMAIL_TRANSPORT;
      else process.env.EMAIL_TRANSPORT = value;
      const fetchMock = stubFetch(ok);
      await run(t);
      expect(fetchMock, String(value)).not.toHaveBeenCalled();
      expect(await events(t)).toEqual([]);
      expect(await failures(t)).toEqual([]);
    }
  });

  test("an unknown EMAIL_TRANSPORT writes one failure row per day and sends nothing", async () => {
    const { t, overdue } = await setup();
    await overdue(daysAgo(2));
    process.env.EMAIL_TRANSPORT = "smtp";
    const fetchMock = stubFetch(ok);
    await run(t);
    await run(t);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await events(t)).toEqual([]);
    expect(await failures(t)).toMatchObject([
      { executionId: `direct-reminders-config:${ASOF}`, message: "config: unknown EMAIL_TRANSPORT" },
    ]);
  });

  test("sends one reminder per overdue loan and writes reminder_sent under the n8n key", async () => {
    const { t, overdue } = await setup();
    const loanId = await overdue(daysAgo(2));
    await overdue(daysAgo(1), { returnedAt: 1 }); // returned: not reminded
    await overdue(todayUtc(Date.now() + DAY)); // not yet due
    const fetchMock = stubFetch(ok);
    await run(t);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(BREVO_URL);
    const expected = reminderEmail(
      { borrower: { firstName: "Bob" }, toolName: "Drill", endDate: daysAgo(2), daysOverdue: 2 },
      APP_URL,
    );
    expect(bodies(fetchMock)[0]).toEqual({
      sender: { email: "demo@lendloop.example.test", name: "LendLoop" },
      to: [{ email: "bob@example.com", name: "Bob" }],
      subject: expected.subject,
      textContent: expected.text,
    });
    const evs = await events(t);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ kind: "reminder_sent", idempotencyKey: `reminder:${loanId}:${ASOF}`, loanId });
    expect(await failures(t)).toEqual([]);
  });

  test("a same-day rerun emails nobody twice", async () => {
    const { t, overdue } = await setup();
    await overdue(daysAgo(2));
    const fetchMock = stubFetch(ok);
    await run(t);
    await run(t);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await events(t)).toHaveLength(1);
  });

  test("a failed send is recorded, redacted, alerts the admin once, and is retried on a rerun", async () => {
    const { t, overdue } = await setup();
    const loanId = await overdue(daysAgo(2));
    process.env.ADMIN_ALERT_EMAIL = "admin@example.test";
    let reminderStatus = 400;
    const fetchMock = stubFetch(async (_u, init) => {
      const to = JSON.parse(init.body as string).to[0].email;
      if (to === "bob@example.com") {
        return new Response(JSON.stringify({ code: "invalid_parameter", message: "bad bob@example.com" }), {
          status: reminderStatus,
        });
      }
      return new Response("{}", { status: 201 });
    });
    await run(t);

    expect(await events(t)).toMatchObject([
      { kind: "reminder_failed", idempotencyKey: `reminder:${loanId}:${ASOF}`, detail: "HTTP 400 invalid_parameter" },
    ]);
    expect(await failures(t)).toMatchObject([
      { workflow: "overdue-reminders (direct)", executionId: `direct-reminders:${ASOF}`, message: "1 of 1 reminders failed" },
    ]);
    const sent = bodies(fetchMock);
    expect(sent).toHaveLength(2);
    expect(sent[1].to).toEqual([{ email: "admin@example.test" }]);
    expect(sent[1].subject).toBe("[LendLoop] Workflow failed: overdue-reminders (direct)");
    expect(JSON.stringify(await events(t))).not.toContain("@");

    // Rerun after Brevo recovers: the failed one is retried and upgraded; no second alert, one failure row.
    reminderStatus = 201;
    await run(t);
    expect(await events(t)).toMatchObject([{ kind: "reminder_sent" }]);
    expect(await failures(t)).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("no ADMIN_ALERT_EMAIL: the failure row is written and no alert is sent; a failing alert is ignored", async () => {
    const { t, overdue } = await setup();
    await overdue(daysAgo(2));
    const fetchMock = stubFetch(async () => new Response("{}", { status: 500 }));
    await run(t);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await failures(t)).toHaveLength(1);

    const second = await setup();
    await second.overdue(daysAgo(2));
    process.env.ADMIN_ALERT_EMAIL = "admin@example.test";
    const fetch2 = stubFetch(async () => new Response("{}", { status: 500 }));
    await run(second.t); // the alert also gets a 500: must not throw
    expect(fetch2).toHaveBeenCalledTimes(2);
    expect(await failures(second.t)).toHaveLength(1);
  });

  test("a missing config records a failure and sends nothing", async () => {
    const { t, overdue } = await setup();
    await overdue(daysAgo(2));
    delete process.env.BREVO_API_KEY;
    const fetchMock = stubFetch(ok);
    await run(t);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await failures(t)).toMatchObject([{ message: "config: missing BREVO_API_KEY" }]);
    expect(await events(t)).toEqual([]);
  });

  /** n extra overdue loans (copies of one), on top of those already made. */
  async function addLoans(t: T, from: Id<"loans">, n: number) {
    await t.run(async (ctx) => {
      const { _id, _creationTime, ...rest } = (await ctx.db.get(from))!;
      void _id;
      void _creationTime;
      for (let i = 0; i < n; i++) await ctx.db.insert("loans", rest);
    });
  }

  test("a run is capped at 40; the rest are reported as deferred and sent by the next run", async () => {
    const { t, overdue } = await setup();
    const first = await overdue(daysAgo(2));
    await addLoans(t, first, 49); // 50 overdue
    const fetchMock = stubFetch(ok);
    await run(t);
    expect(MAX_PER_RUN).toBe(40);
    expect(fetchMock).toHaveBeenCalledTimes(40);
    expect(await events(t)).toHaveLength(40);
    expect(await failures(t)).toMatchObject([
      { executionId: `direct-reminders-deferred:${ASOF}`, message: "10 reminders deferred to the next run (cap 40)" },
    ]);
    await run(t);
    expect(fetchMock).toHaveBeenCalledTimes(50);
    expect(await events(t)).toHaveLength(50);
    expect(await failures(t)).toHaveLength(1); // the deferred row is written once per day
  }, 60_000);

  test("a crash midway: the rerun emails only the loans not yet recorded", async () => {
    const { t, overdue } = await setup();
    const first = await overdue(daysAgo(2));
    await addLoans(t, first, 4); // 5 overdue
    const fetchMock = stubFetch(ok);
    // The action itself dies when it starts its 3rd send (postSignal runs before the send's own try/catch).
    const real = AbortSignal.timeout.bind(AbortSignal);
    let calls = 0;
    const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      if (++calls === 3) throw new Error("simulated crash");
      return real(ms);
    });
    await expect(run(t)).rejects.toThrow("simulated crash");
    spy.mockRestore();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await events(t)).toHaveLength(2);

    await run(t);
    expect(fetchMock).toHaveBeenCalledTimes(5); // 3 more, not 5
    const evs = await events(t);
    expect(evs).toHaveLength(5);
    expect(new Set(evs.map((e) => e.idempotencyKey)).size).toBe(5);
    expect(evs.every((e) => e.kind === "reminder_sent")).toBe(true);
  });

  test("a write-back that returns null records the loan id only and stops the run", async () => {
    const { t, overdue } = await setup();
    const first = await overdue(daysAgo(2));
    await addLoans(t, first, 2); // 3 overdue
    let calls = 0;
    const fetchMock = stubFetch(async () => {
      // While the 2nd email is being sent, its loan disappears: recordReminders rejects it.
      if (++calls === 2) {
        const gone = (await t.run((ctx) => ctx.db.query("loans").collect())).map((l) => l._id)[1];
        await t.run((ctx) => ctx.db.delete(gone));
      }
      return new Response("{}", { status: 201 });
    });
    await run(t);
    // The overdue feed is ordered by loan within one end date, so exactly one loan was deleted.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
    const rows = await failures(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toMatch(/^could not record the reminder for loan [^ ]+; run stopped$/);
    expect(rows[0].message).not.toContain("@");
    expect(await events(t)).toHaveLength(1); // only the first was recorded
    expect(fetchMock).toHaveBeenCalledTimes(2); // stopped before the 3rd
  });
});
