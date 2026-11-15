import type { TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { asUser, modules, newTest } from "./test.setup";
import { todayUtc } from "./lib/availability";

const DAY = 86_400_000;
const d = (n: number) => todayUtc(Date.now() + n * DAY);

type T = TestConvex<typeof schema>;
type Status = "pending" | "approved" | "declined" | "cancelled" | "returned";

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const data = (e as { data?: { code?: string } }).data;
    return data?.code ?? `non-convex: ${String(e)}`;
  }
  return "no error";
}

async function setup() {
  const t = newTest(modules);
  const alice = await asUser(t, { name: "Alice Anders", email: "alice@example.com" });
  const bob = await asUser(t, { name: "Bob Brown", email: "bob@example.com" });
  const admin = await asUser(t, { name: "Ada Admin", email: "ada@example.com", role: "admin" });
  const toolId = await seedTool(t, alice.userId);
  return { t, alice, bob, admin, toolId };
}

function seedTool(t: T, ownerId: Id<"users">, shortCode = "PWR 001") {
  return t.run((ctx) =>
    ctx.db.insert("tools", {
      ownerId,
      name: "Drill",
      category: "power_tools",
      condition: "good",
      description: "d",
      shortCode,
      status: "active",
    }),
  );
}

function seedLoan(
  t: T,
  toolId: Id<"tools">,
  lenderId: Id<"users">,
  borrowerId: Id<"users">,
  status: Status,
  startDate: string,
  endDate: string,
) {
  return t.run((ctx) =>
    ctx.db.insert("loans", { toolId, lenderId, borrowerId, startDate, endDate, status }),
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe("admin", () => {
  test("removeListing by role 'user' → FORBIDDEN", async () => {
    const { alice, toolId } = await setup();
    expect(await code(alice.mutation(api.admin.removeListing, { toolId }))).toBe("FORBIDDEN");
  });

  test("admin removes another user's listing; its pending requests become declined", async () => {
    const { t, alice, bob, admin, toolId } = await setup();
    const pending = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(5), d(6));
    const approved = await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(-1), d(2));
    await admin.mutation(api.admin.removeListing, { toolId, reason: "  unsafe  " });
    const tool = await t.run((ctx) => ctx.db.get(toolId));
    expect(tool).toMatchObject({
      status: "removed",
      removedBy: admin.userId,
      removedReason: "unsafe",
    });
    expect(tool?.removedAt).toBeTypeOf("number");
    const p = await t.run((ctx) => ctx.db.get(pending));
    expect(p?.status).toBe("declined");
    expect(p?.decidedAt).toBeTypeOf("number");
    expect((await t.run((ctx) => ctx.db.get(approved)))?.status).toBe("approved");
    expect(await code(admin.mutation(api.admin.removeListing, { toolId }))).toBe("NOT_FOUND");
    const other = await seedTool(t, alice.userId, "PWR 002");
    expect(
      await code(admin.mutation(api.admin.removeListing, { toolId: other, reason: "x".repeat(281) })),
    ).toBe("INVALID_INPUT");
  });

  test("setTrustedLender is reflected in tools.list ownerTrusted", async () => {
    const { alice, bob, admin } = await setup();
    expect((await bob.query(api.tools.list, {}))[0].ownerTrusted).toBe(false);
    await admin.mutation(api.admin.setTrustedLender, { userId: alice.userId, trusted: true });
    expect((await bob.query(api.tools.list, {}))[0].ownerTrusted).toBe(true);
    expect(
      await code(bob.mutation(api.admin.setTrustedLender, { userId: alice.userId, trusted: false })),
    ).toBe("FORBIDDEN");
  });

  test("allLoans → FORBIDDEN for user; returns every loan for admin", async () => {
    const { t, alice, bob, admin, toolId } = await setup();
    expect(await code(alice.query(api.admin.allLoans, {}))).toBe("FORBIDDEN");
    await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(1), d(2));
    const second = await seedLoan(t, toolId, alice.userId, bob.userId, "returned", d(-5), d(-3));
    const all = await admin.query(api.admin.allLoans, {});
    expect(all).toHaveLength(2);
    expect(all[0]._id).toBe(second); // newest first
    expect(all[0]).toMatchObject({
      lenderName: "Alice Anders",
      borrowerName: "Bob Brown",
      counterpartFirstName: "Bob",
      lastEmail: null,
    });
    expect(JSON.stringify(all)).not.toMatch(/example\.com|tokenIdentifier/);
    const returned = await admin.query(api.admin.allLoans, { status: "returned" });
    expect(returned.map((l) => l._id)).toEqual([second]);
  });

  test("lenders is admin-only and returns timesLent", async () => {
    const { t, alice, bob, admin, toolId } = await setup();
    expect(await code(alice.query(api.admin.lenders, {}))).toBe("FORBIDDEN");
    await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(1), d(2));
    await seedLoan(t, toolId, alice.userId, bob.userId, "returned", d(-5), d(-3));
    await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(8), d(9));
    await seedLoan(t, toolId, alice.userId, bob.userId, "declined", d(10), d(11));
    // a lender whose only tool was removed still appears; non-lenders do not
    const carl = await asUser(t, { name: "Carl Cole", email: "carl@example.com" });
    const gone = await seedTool(t, carl.userId, "PWR 002");
    await t.run((ctx) => ctx.db.patch(gone, { status: "removed" }));
    const rows = await admin.query(api.admin.lenders, {});
    expect(rows).toEqual([
      { userId: alice.userId, name: "Alice Anders", trustedLender: false, timesLent: 2 },
      { userId: carl.userId, name: "Carl Cole", trustedLender: false, timesLent: 0 },
    ]);
  });

  test("automationHealth is admin-only and returns failed rows newest first", async () => {
    const { t, alice, bob, admin, toolId } = await setup();
    expect(await code(alice.query(api.admin.automationHealth, {}))).toBe("FORBIDDEN");
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(1), d(2));
    await t.run(async (ctx) => {
      for (const [eventId, status] of [["e1", "failed"], ["e2", "delivered"], ["e3", "failed"]] as const) {
        await ctx.db.insert("outbox", {
          eventId,
          loanId,
          type: "request_created",
          payload: {
            eventId,
            type: "request_created",
            loanId,
            recipient: { email: "alice@example.com", firstName: "Alice" },
            tool: { name: "Drill" },
            startDate: d(1),
            endDate: d(2),
          },
          status,
          attempts: 1,
        });
      }
      await ctx.db.insert("automationFailures", { workflow: "w", executionId: "x1", message: "a", at: 1 });
      await ctx.db.insert("automationFailures", { workflow: "w", executionId: "x2", message: "b", at: 2 });
    });
    const health = await admin.query(api.admin.automationHealth, {});
    expect(health.failedDeliveries.map((r) => r.eventId)).toEqual(["e3", "e1"]);
    expect(health.workflowFailures.map((r) => r.executionId)).toEqual(["x2", "x1"]);
    // Admin views carry names, never emails: no payload and no address anywhere.
    for (const r of health.failedDeliveries) expect(r).not.toHaveProperty("payload");
    expect(JSON.stringify(health)).not.toContain("example.com");
  });

  test("allLoans lastEmail is the newest automation event, failed only for reminder_failed", async () => {
    const { t, alice, bob, admin, toolId } = await setup();
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(-5), d(-2));
    const quiet = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(3), d(4));
    const add = (kind: "notification_sent" | "reminder_sent" | "reminder_failed", at: number, key: string) =>
      t.run((ctx) => ctx.db.insert("automationEvents", { loanId, kind, idempotencyKey: key, at }));
    await add("reminder_failed", 300, "k3");
    await add("notification_sent", 100, "k1");
    await add("reminder_sent", 200, "k2");
    const find = async () => (await admin.query(api.admin.allLoans, {})).find((l) => l._id === loanId);
    expect((await find())?.lastEmail).toEqual({ kind: "reminder_failed", at: 300, failed: true });
    expect((await find())?.activity.map((a) => a.at)).toEqual([100, 200, 300]);
    await t.run(async (ctx) => {
      const [row] = await ctx.db.query("automationEvents").withIndex("by_key", (q) => q.eq("idempotencyKey", "k3")).collect();
      await ctx.db.patch(row._id, { kind: "reminder_sent" });
    });
    expect((await find())?.lastEmail).toEqual({ kind: "reminder_sent", at: 300, failed: false });
    const all = await admin.query(api.admin.allLoans, {});
    expect(all.find((l) => l._id === quiet)?.lastEmail).toBeNull();
  });

  test("deliveryFailed follows the newest outbox row of the loan", async () => {
    const { t, alice, bob, toolId } = await setup();
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(1), d(2));
    const add = (status: "failed" | "delivered", eventId: string) =>
      t.run((ctx) =>
        ctx.db.insert("outbox", {
          eventId,
          loanId,
          type: "request_created",
          payload: {
            eventId,
            type: "request_created",
            loanId,
            recipient: { email: "alice@example.com", firstName: "Alice" },
            tool: { name: "Drill" },
            startDate: d(1),
            endDate: d(2),
          },
          status,
          attempts: 1,
        }),
      );
    const flag = async () => (await bob.query(api.loans.myRequests, {}))[0].deliveryFailed;
    expect(await flag()).toBe(false);
    await add("failed", "o1");
    expect(await flag()).toBe(true);
    await add("delivered", "o2");
    expect(await flag()).toBe(false);
  });

  test("automationHealth.stalePending lists pending rows older than 2h, newest first, without payload", async () => {
    const { t, alice, bob, admin, toolId } = await setup();
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(1), d(2));
    const add = (eventId: string, status: "pending" | "delivered") =>
      t.run((ctx) =>
        ctx.db.insert("outbox", {
          eventId,
          loanId,
          type: "request_created",
          payload: {
            eventId,
            type: "request_created",
            loanId,
            recipient: { email: "alice@example.com", firstName: "Alice" },
            tool: { name: "Drill" },
            startDate: d(1),
            endDate: d(2),
          },
          status,
          attempts: 0,
        }),
      );
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now());
    await add("old1", "pending");
    await add("oldDelivered", "delivered");
    vi.setSystemTime(Date.now() + 60_000);
    await add("old2", "pending");
    vi.setSystemTime(Date.now() + 3_600_000);
    await add("justUnder", "pending");
    // Query 1h59m after justUnder: it is just under 2h old, so not stale.
    vi.setSystemTime(Date.now() + 119 * 60_000);
    await add("fresh", "pending");
    const health = await admin.query(api.admin.automationHealth, {});
    expect(health.stalePending.map((r) => r.eventId)).toEqual(["old2", "old1"]);
    for (const r of health.stalePending) expect(r).not.toHaveProperty("payload");
    expect(JSON.stringify(health.stalePending)).not.toContain("example.com");
    expect(health.failedDeliveries).toEqual([]);
  });
});
