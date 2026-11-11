import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { asUser, modules } from "./test.setup";
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
  const t = convexTest(schema, modules);
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
    for (const r of health.failedDeliveries) {
      expect(Object.keys(r).sort()).toEqual(
        ["_creationTime", "_id", "attempts", "eventId", "lastError", "loanId", "status", "type"]
          .filter((k) => k !== "lastError" || k in r)
          .sort(),
      );
    }
    expect(health.failedDeliveries[0]).not.toHaveProperty("payload");
    expect(JSON.stringify(health)).not.toContain("example.com");
  });
});
