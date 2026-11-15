import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { asUser, modules } from "../test.setup";
import { todayUtc } from "../lib/availability";
import { verifyToken } from "../lib/signing";
import { RETRY_DELAYS_MS } from "./outbox";
import { STALE_PENDING_MS } from "../admin";

const DAY = 86_400_000;
const d = (n: number) => todayUtc(Date.now() + n * DAY);
const SECRET = "test-secret-for-outbox-tests-0123456789";
const URL_ = "http://n8n.test/webhook/loan-events";

const ALLOWED = ["eventId", "type", "loanId", "recipient", "tool", "startDate", "endDate"];

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {
    LENDLOOP_TO_N8N_SECRET: process.env.LENDLOOP_TO_N8N_SECRET,
    N8N_REQUEST_WEBHOOK_URL: process.env.N8N_REQUEST_WEBHOOK_URL,
  };
  process.env.LENDLOOP_TO_N8N_SECRET = SECRET;
  process.env.N8N_REQUEST_WEBHOOK_URL = URL_;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [k, val] of Object.entries(savedEnv)) {
    if (val === undefined) delete process.env[k];
    else process.env[k] = val;
  }
});

async function setup() {
  const t = convexTest(schema, modules);
  const alice = await asUser(t, { name: "Alice Anders", email: "alice@example.com" });
  const bob = await asUser(t, { name: "Bob Brown", email: "bob@example.com" });
  const cara = await asUser(t, { name: "Cara Cole", email: "cara@example.com" });
  const admin = await asUser(t, { name: "Ada Admin", email: "ada@example.com", role: "admin" });
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
  return { t, alice, bob, cara, admin, toolId };
}

type Ctx = Awaited<ReturnType<typeof setup>>;
const outboxRows = (t: Ctx["t"]) => t.run((ctx) => ctx.db.query("outbox").collect());

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as { data?: { code?: string } }).data?.code ?? `non-convex: ${String(e)}`;
  }
  return "no error";
}

describe("outbox", () => {
  test("payload keys equal the allowlist exactly (deep key check)", async () => {
    const { t, bob, toolId } = await setup();
    stubFetch(async () => new Response("ok", { status: 200 }));
    await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(2) });
    const [row] = await outboxRows(t);
    expect(Object.keys(row.payload).sort()).toEqual([...ALLOWED].sort());
    expect(Object.keys(row.payload.recipient).sort()).toEqual(["email", "firstName"]);
    expect(Object.keys(row.payload.tool)).toEqual(["name"]);
    expect(row.payload.recipient).toEqual({ email: "alice@example.com", firstName: "Alice" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  test("a recipient with no name enqueues firstName '' (passes the payload validator)", async () => {
    const { t, alice, bob, toolId } = await setup();
    stubFetch(async () => new Response("ok", { status: 200 }));
    await t.run((ctx) => ctx.db.patch(alice.userId, { name: "" }));
    await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(2) });
    const [row] = await outboxRows(t);
    expect(row.payload.recipient).toEqual({ email: "alice@example.com", firstName: "" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  test("each loan transition enqueues exactly one outbox row with the correct recipient", async () => {
    const { t, alice, bob, toolId } = await setup();
    stubFetch(async () => new Response("ok", { status: 200 }));
    const lender = "alice@example.com";
    const borrower = "bob@example.com";
    const step = async (
      action: string,
      fn: () => Promise<unknown>,
      type: string,
      email: string,
    ) => {
      const before = (await outboxRows(t)).length;
      await fn();
      const rows = await outboxRows(t);
      expect(rows.length, action).toBe(before + 1);
      const row = rows[rows.length - 1];
      expect(row.type, action).toBe(type);
      expect(row.payload.type, action).toBe(type);
      expect(row.payload.recipient.email, action).toBe(email);
      expect(row.status).toBe("pending");
      expect(row.attempts).toBe(0);
    };

    let loanId!: Id<"loans">;
    await step(
      "request",
      async () => {
        loanId = await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(2) });
      },
      "request_created",
      lender,
    );
    await step("approve", () => alice.mutation(api.loans.approve, { loanId }), "request_approved", borrower);
    await step("markReturned", () => alice.mutation(api.loans.markReturned, { loanId }), "loan_returned", borrower);

    let l2!: Id<"loans">;
    await step(
      "request2",
      async () => {
        l2 = await bob.mutation(api.loans.request, { toolId, startDate: d(5), endDate: d(6) });
      },
      "request_created",
      lender,
    );
    await step("decline", () => alice.mutation(api.loans.decline, { loanId: l2 }), "request_declined", borrower);

    let l3!: Id<"loans">;
    await step(
      "request3",
      async () => {
        l3 = await bob.mutation(api.loans.request, { toolId, startDate: d(8), endDate: d(9) });
      },
      "request_created",
      lender,
    );
    await step("cancel", () => bob.mutation(api.loans.cancel, { loanId: l3 }), "request_cancelled", lender);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  test("tools.remove and admin.removeListing enqueue request_declined for each pending request", async () => {
    for (const via of ["tools.remove", "admin.removeListing"] as const) {
      const { t, alice, bob, cara, admin, toolId } = await setup();
      stubFetch(async () => new Response("ok", { status: 200 }));
      await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(2) });
      await cara.mutation(api.loans.request, { toolId, startDate: d(5), endDate: d(6) });
      if (via === "tools.remove") await alice.mutation(api.tools.remove, { toolId });
      else await admin.mutation(api.admin.removeListing, { toolId });
      const declined = (await outboxRows(t)).filter((r) => r.type === "request_declined");
      expect(declined.map((r) => r.payload.recipient.email).sort(), via).toEqual([
        "bob@example.com",
        "cara@example.com",
      ]);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    }
  });

  test("non-2xx reschedules with the next delay; 5th failure sets status 'failed'", async () => {
    const { t, bob, toolId } = await setup();
    const fetchMock = stubFetch(async () => new Response("boom", { status: 500 }));
    await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(2) });
    expect(RETRY_DELAYS_MS).toEqual([30_000, 120_000, 600_000, 3_600_000]);

    // Observe the scheduled delay after each failure, one run at a time.
    const scheduledAfter = async () => {
      const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
      return jobs.filter((j) => j.state.kind === "pending");
    };
    vi.advanceTimersByTime(1); // start the delay-0 delivery
    for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
      await t.finishInProgressScheduledFunctions();
      const [row] = await outboxRows(t);
      expect(row.attempts).toBe(i + 1);
      expect(row.status).toBe("pending");
      expect(row.lastError).toBe("HTTP 500");
      const pending = await scheduledAfter();
      expect(pending).toHaveLength(1);
      expect(Math.round(pending[0].scheduledTime - Date.now())).toBeGreaterThan(RETRY_DELAYS_MS[i] - 5_000);
      expect(Math.round(pending[0].scheduledTime - Date.now())).toBeLessThanOrEqual(RETRY_DELAYS_MS[i]);
      vi.advanceTimersByTime(RETRY_DELAYS_MS[i] + 1);
    }
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    const [row] = await outboxRows(t);
    expect(row.status).toBe("failed");
    expect(row.attempts).toBe(5);
    expect(row.lastError).toBe("HTTP 500");
    expect(await scheduledAfter()).toHaveLength(0);
  });

  test("a delivered row is never re-sent", async () => {
    const { t, bob, toolId } = await setup();
    const fetchMock = stubFetch(async () => new Response("ok", { status: 200 }));
    await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(2) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The POSTed body is { token }, a valid HS256 JWS for the n8n audience.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL_);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(Object.keys(body)).toEqual(["token"]);
    const claims = await verifyToken<Record<string, unknown>>(body.token, {
      secret: SECRET,
      audience: "n8n",
      scope: "loan-event",
    });
    const [row] = await outboxRows(t);
    expect(row.status).toBe("delivered");
    const payloadKeys = Object.keys(claims).filter((k) => !["iat", "exp", "jti", "aud", "scope"].includes(k));
    expect(payloadKeys.sort()).toEqual([...ALLOWED].sort());
    expect(claims.eventId).toBe(row.eventId);

    await t.action(internal.automation.outbox.deliver, { outboxId: row._id });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await outboxRows(t))[0].status).toBe("delivered");
  });

  test("retryDelivery is admin-only and re-queues a failed row", async () => {
    const { t, alice, bob, admin, toolId } = await setup();
    const fetchMock = stubFetch(async () => new Response("boom", { status: 500 }));
    await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(2) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [row] = await outboxRows(t);
    expect(row.status).toBe("failed");

    expect(await code(alice.mutation(api.admin.retryDelivery, { outboxId: row._id }))).toBe("FORBIDDEN");

    fetchMock.mockImplementation(async () => new Response("ok", { status: 200 }));
    await admin.mutation(api.admin.retryDelivery, { outboxId: row._id });
    const requeued = (await outboxRows(t))[0];
    expect(requeued).toMatchObject({ status: "pending", attempts: 0 });
    expect(requeued.lastError).toBeUndefined();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await outboxRows(t))[0].status).toBe("delivered");

    // Not failed any more -> INVALID_TRANSITION; deleted row -> NOT_FOUND.
    expect(await code(admin.mutation(api.admin.retryDelivery, { outboxId: row._id }))).toBe("INVALID_TRANSITION");
    const gone = await t.run(async (ctx) => {
      const id = await ctx.db.insert("outbox", {
        eventId: "x",
        loanId: row.loanId,
        type: "request_created",
        payload: row.payload,
        status: "failed",
        attempts: 5,
      });
      await ctx.db.delete(id);
      return id;
    });
    expect(await code(admin.mutation(api.admin.retryDelivery, { outboxId: gone }))).toBe("NOT_FOUND");
  });

  /** A delivered row from a real request, plus a pending copy with no scheduled job (a lost job). */
  async function lostPendingRow(t: Ctx["t"], bob: Ctx["bob"], toolId: Ctx["toolId"]) {
    await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(2) });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [delivered] = await outboxRows(t);
    expect(delivered.status).toBe("delivered");
    const lostId = await t.run((ctx) =>
      ctx.db.insert("outbox", {
        eventId: "lost-1",
        loanId: delivered.loanId,
        type: "request_created",
        payload: { ...delivered.payload, eventId: "lost-1" },
        status: "pending",
        attempts: 2,
        lastError: "HTTP 500",
      }),
    );
    return { delivered, lostId };
  }

  test("enqueue stamps queuedAt with the enqueue time", async () => {
    const { t, bob, toolId } = await setup();
    stubFetch(async () => new Response("ok", { status: 200 }));
    const before = Date.now();
    await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(2) });
    const [row] = await outboxRows(t);
    // convex-test may tick the clock by a millisecond inside the mutation.
    expect(row.queuedAt).toBeGreaterThanOrEqual(before);
    expect(row.queuedAt! - before).toBeLessThan(1_000);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  test("retryDelivery re-queues a pending row stuck over 2 hours, but not a fresh pending or delivered row", async () => {
    const { t, bob, admin, toolId } = await setup();
    const fetchMock = stubFetch(async () => new Response("ok", { status: 200 }));
    const { delivered, lostId } = await lostPendingRow(t, bob, toolId);

    // Fresh pending: its retries may still be scheduled, so a manual retry is refused.
    expect(await code(admin.mutation(api.admin.retryDelivery, { outboxId: lostId }))).toBe("INVALID_TRANSITION");

    vi.setSystemTime(Date.now() + STALE_PENDING_MS + 60_000);
    expect((await admin.query(api.admin.automationHealth, {})).stalePending.map((r) => r._id)).toEqual([lostId]);
    const retriedAt = Date.now();
    await admin.mutation(api.admin.retryDelivery, { outboxId: lostId });
    const requeued = (await outboxRows(t)).find((r) => r._id === lostId);
    expect(requeued).toMatchObject({ status: "pending", attempts: 0 });
    expect(requeued?.queuedAt).toBeGreaterThanOrEqual(retriedAt);
    expect(requeued?.lastError).toBeUndefined();

    const calls = fetchMock.mock.calls.length;
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(calls + 1);
    expect((await outboxRows(t)).find((r) => r._id === lostId)?.status).toBe("delivered");
    expect(await code(admin.mutation(api.admin.retryDelivery, { outboxId: delivered._id }))).toBe(
      "INVALID_TRANSITION",
    );
  });

  test("stuck is measured from queuedAt, so a freshly retried old row is not stuck again", async () => {
    const { t, bob, admin, toolId } = await setup();
    stubFetch(async () => new Response("ok", { status: 200 }));
    const { lostId } = await lostPendingRow(t, bob, toolId);
    const stale = async () => (await admin.query(api.admin.automationHealth, {})).stalePending.map((r) => r._id);

    vi.setSystemTime(Date.now() + STALE_PENDING_MS + 60_000);
    expect(await stale()).toEqual([lostId]); // no queuedAt: falls back to _creationTime
    // Created over 2h ago, but queued again just now: not stuck.
    await t.run((ctx) => ctx.db.patch(lostId, { queuedAt: Date.now() }));
    expect(await stale()).toEqual([]);
    // Two hours after that re-queue it is stuck again.
    vi.setSystemTime(Date.now() + STALE_PENDING_MS + 1);
    expect(await stale()).toEqual([lostId]);
  });

  async function pendingJobs(t: Ctx["t"]) {
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    return jobs.filter((j) => j.state.kind === "pending");
  }

  test("a missing N8N_REQUEST_WEBHOOK_URL records a config error and schedules a retry", async () => {
    const { t, bob, toolId } = await setup();
    delete process.env.N8N_REQUEST_WEBHOOK_URL;
    const fetchMock = stubFetch(async () => new Response("ok", { status: 200 }));
    await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(2) });
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
    const [row] = await outboxRows(t);
    expect(row).toMatchObject({
      status: "pending",
      attempts: 1,
      lastError: "config: missing N8N_REQUEST_WEBHOOK_URL",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await pendingJobs(t)).toHaveLength(1);
  });

  test("a fetch that throws records the failure and schedules a retry", async () => {
    const { t, bob, toolId } = await setup();
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(2) });
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
    const [row] = await outboxRows(t);
    expect(row).toMatchObject({ status: "pending", attempts: 1, lastError: "TypeError: fetch failed" });
    expect(row.lastError).not.toContain(SECRET);
    expect(await pendingJobs(t)).toHaveLength(1);
  });

  test("a loan mutation that throws leaves no outbox row", async () => {
    const { t, alice, bob, toolId } = await setup();
    stubFetch(async () => new Response("ok", { status: 200 }));
    const loanId = await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(2) });
    await bob.mutation(api.loans.cancel, { loanId });
    const before = await outboxRows(t);
    expect(await code(alice.mutation(api.loans.approve, { loanId }))).toBe("INVALID_TRANSITION");
    expect(await outboxRows(t)).toHaveLength(before.length);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});
