import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { RETENTION_BATCH } from "./retention";
import { asUser, newTest } from "./test.setup";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 15, 1, 0, 0);

// convex-test hands out _creationTime from a clock that never goes backwards, so the
// tests start well before NOW and insert rows oldest first.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW - 400 * DAY);
});
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = newTest();
  const alice = await asUser(t, { name: "Alice Anders", email: "alice@example.com" });
  const bob = await asUser(t, { name: "Bob Brown", email: "bob@example.com" });
  const toolId = await t.run((ctx) =>
    ctx.db.insert("tools", {
      ownerId: alice.userId, name: "Drill", category: "power_tools", condition: "good",
      description: "d", shortCode: "PWR 001", status: "active",
    }),
  );
  const loanId = await t.run((ctx) =>
    ctx.db.insert("loans", {
      toolId, lenderId: alice.userId, borrowerId: bob.userId,
      startDate: "2026-11-01", endDate: "2026-11-02", status: "returned",
    }),
  );
  return { t, loanId };
}
type T = Awaited<ReturnType<typeof setup>>["t"];

/** Inserts an outbox row as if it had been created `ageDays` before NOW. */
async function outboxRow(
  t: T, loanId: Id<"loans">, status: "pending" | "delivered" | "failed", ageDays: number, tag = "x",
) {
  vi.setSystemTime(NOW - ageDays * DAY);
  return t.run((ctx) =>
    ctx.db.insert("outbox", {
      eventId: `${tag}-${status}-${ageDays}`,
      loanId,
      type: "request_created",
      payload: {
        eventId: `${tag}-${status}-${ageDays}`, type: "request_created", loanId,
        recipient: { email: "alice@example.com", firstName: "Alice" },
        tool: { name: "Drill" }, startDate: "2026-11-01", endDate: "2026-11-02",
      },
      status,
      attempts: 1,
    }),
  );
}

const run = (t: T) => t.mutation(internal.retention.run, { now: NOW });
const get = (t: T, id: Id<"outbox">) => t.run((ctx) => ctx.db.get(id));

describe("retention: redaction (7 days)", () => {
  test("an 8-day-old delivered row is redacted; a 6-day-old one is not", async () => {
    const { t, loanId } = await setup();
    const old = await outboxRow(t, loanId, "delivered", 8);
    const fresh = await outboxRow(t, loanId, "delivered", 6);
    vi.setSystemTime(NOW);
    expect(await run(t)).toMatchObject({ redacted: 1 });

    const redacted = await get(t, old);
    expect(redacted?.payload.recipient).toEqual({ email: "", firstName: "" });
    expect(redacted?.redactedAt).toBe(NOW);
    // Everything else the row says is kept.
    expect(redacted?.payload).toMatchObject({ tool: { name: "Drill" }, startDate: "2026-11-01", type: "request_created" });
    expect(redacted?.status).toBe("delivered");

    const kept = await get(t, fresh);
    expect(kept?.payload.recipient).toEqual({ email: "alice@example.com", firstName: "Alice" });
    expect(kept?.redactedAt).toBeUndefined();
  });

  test("failed and pending rows are never redacted, however old", async () => {
    const { t, loanId } = await setup();
    const failed = await outboxRow(t, loanId, "failed", 30);
    const pending = await outboxRow(t, loanId, "pending", 30);
    vi.setSystemTime(NOW);
    expect(await run(t)).toMatchObject({ redacted: 0, outboxDeleted: 0 });
    for (const id of [failed, pending]) {
      const row = await get(t, id);
      expect(row?.payload.recipient.email).toBe("alice@example.com");
      expect(row?.redactedAt).toBeUndefined();
    }
  });

  test("a second run is a no-op", async () => {
    const { t, loanId } = await setup();
    const old = await outboxRow(t, loanId, "delivered", 8);
    vi.setSystemTime(NOW);
    await run(t);
    const after = await get(t, old);
    expect(await run(t)).toEqual({ redacted: 0, outboxDeleted: 0, eventsDeleted: 0, failuresDeleted: 0 });
    expect(await get(t, old)).toEqual(after);
  });
});

describe("retention: deletion", () => {
  test("delivered outbox rows go at 90 days, not before", async () => {
    const { t, loanId } = await setup();
    const at91 = await outboxRow(t, loanId, "delivered", 91);
    const failed91 = await outboxRow(t, loanId, "failed", 91);
    const at89 = await outboxRow(t, loanId, "delivered", 89);
    vi.setSystemTime(NOW);
    expect(await run(t)).toMatchObject({ outboxDeleted: 1 });
    expect(await get(t, at91)).toBeNull();
    expect((await get(t, at89))?.payload.recipient.email).toBe("");
    expect(await get(t, failed91)).not.toBeNull();
  });

  test("automationEvents and automationFailures go at 180 days, not before", async () => {
    const { t, loanId } = await setup();
    const ids: Record<string, Id<"automationEvents"> | Id<"automationFailures">> = {};
    for (const age of [181, 179]) {
      vi.setSystemTime(NOW - age * DAY);
      ids[`event${age}`] = await t.run((ctx) =>
        ctx.db.insert("automationEvents", { loanId, kind: "notification_sent", idempotencyKey: `k${age}`, at: Date.now() }),
      );
      ids[`failure${age}`] = await t.run((ctx) =>
        ctx.db.insert("automationFailures", { workflow: "w", executionId: `e${age}`, message: "m", at: Date.now() }),
      );
    }
    vi.setSystemTime(NOW);
    expect(await run(t)).toMatchObject({ eventsDeleted: 1, failuresDeleted: 1 });
    const left = await t.run(async (ctx) => ({
      events: (await ctx.db.query("automationEvents").collect()).map((e) => e.idempotencyKey),
      failures: (await ctx.db.query("automationFailures").collect()).map((e) => e.executionId),
    }));
    expect(left).toEqual({ events: ["k179"], failures: ["e179"] });
    expect(await run(t)).toEqual({ redacted: 0, outboxDeleted: 0, eventsDeleted: 0, failuresDeleted: 0 });
  });
});

describe("retention: batches", () => {
  test("a full batch schedules another run and nothing is skipped", async () => {
    const { t, loanId } = await setup();
    vi.setSystemTime(NOW - 8 * DAY);
    await t.run(async (ctx) => {
      for (let i = 0; i < RETENTION_BATCH + 1; i++) {
        await ctx.db.insert("outbox", {
          eventId: `b${i}`, loanId, type: "request_created", status: "delivered", attempts: 1,
          payload: {
            eventId: `b${i}`, type: "request_created", loanId,
            recipient: { email: "a@example.com", firstName: "A" },
            tool: { name: "Drill" }, startDate: "2026-11-01", endDate: "2026-11-02",
          },
        });
      }
    });
    vi.setSystemTime(NOW);
    expect(await run(t)).toMatchObject({ redacted: RETENTION_BATCH });
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.some((s) => s.name.includes("retention"))).toBe(true);
    expect(await run(t)).toMatchObject({ redacted: 1 });
    expect(await run(t)).toMatchObject({ redacted: 0 });
    const rows = await t.run((ctx) => ctx.db.query("outbox").collect());
    expect(rows.every((r) => r.payload.recipient.email === "")).toBe(true);
  });
});
