import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { asUser, modules } from "./test.setup";
import { todayUtc } from "./lib/availability";

const DAY = 86_400_000;
function addDays(n: number): string {
  return todayUtc(Date.now() + n * DAY);
}

type T = TestConvex<typeof schema>;

async function seedTool(
  t: T,
  ownerId: Id<"users">,
  over: Partial<{
    name: string;
    category: "power_tools" | "garden";
    status: "active" | "removed";
    shortCode: string;
  }> = {},
) {
  return t.run((ctx) =>
    ctx.db.insert("tools", {
      ownerId,
      name: over.name ?? "Drill",
      category: over.category ?? "power_tools",
      condition: "good",
      description: "d",
      shortCode: over.shortCode ?? "PWR 001",
      status: over.status ?? "active",
    }),
  );
}

async function seedLoan(
  t: T,
  toolId: Id<"tools">,
  lenderId: Id<"users">,
  borrowerId: Id<"users">,
  status: "pending" | "approved" | "declined" | "returned",
  startDate: string,
  endDate: string,
) {
  return t.run((ctx) =>
    ctx.db.insert("loans", { toolId, lenderId, borrowerId, startDate, endDate, status }),
  );
}

async function setup() {
  const t = convexTest(schema, modules);
  const alice = await asUser(t, { name: "Alice Anders", email: "alice@example.com" });
  const bob = await asUser(t, { name: "Bob Brown", email: "bob@example.com" });
  const cara = await asUser(t, { name: "Cara Cole", email: "cara@example.com" });
  return { t, alice, bob, cara };
}

describe("tools", () => {
  test("listPublic returns objects with exactly the keys ['category','name']", async () => {
    const { t, alice } = await setup();
    await seedTool(t, alice.userId);
    const rows = await t.query(api.tools.listPublic, {});
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(["category", "name"]);
  });

  test("listPublic hides removed tools and tools on loan today", async () => {
    const { t, alice, bob } = await setup();
    await seedTool(t, alice.userId, { name: "Free" });
    await seedTool(t, alice.userId, { name: "Gone", status: "removed" });
    const out = await seedTool(t, alice.userId, { name: "Out" });
    await seedLoan(t, out, alice.userId, bob.userId, "approved", addDays(-1), addDays(2));
    const rows = await t.query(api.tools.listPublic, {});
    expect(rows.map((r) => r.name)).toEqual(["Free"]);
  });

  test("list filters by category and marks isMine", async () => {
    const { t, alice, bob } = await setup();
    await seedTool(t, alice.userId, { name: "Drill" });
    await seedTool(t, bob.userId, { name: "Rake", category: "garden", shortCode: "GDN 001" });
    const all = await alice.query(api.tools.list, {});
    expect(all.map((c) => [c.name, c.isMine])).toEqual([
      ["Drill", true],
      ["Rake", false],
    ]);
    const garden = await alice.query(api.tools.list, { category: "garden" });
    expect(garden).toHaveLength(1);
    expect(garden[0]).toMatchObject({ ownerFirstName: "Bob", ownerTrusted: false });
  });

  test("list bookings carry only startDate, endDate and kind: no borrower fields", async () => {
    const { t, alice, bob, cara } = await setup();
    const tool = await seedTool(t, alice.userId);
    await seedLoan(t, tool, alice.userId, bob.userId, "approved", addDays(3), addDays(5));
    await seedLoan(t, tool, alice.userId, cara.userId, "declined", addDays(6), addDays(7));
    await seedLoan(t, tool, alice.userId, cara.userId, "approved", addDays(40), addDays(41));
    const [card] = await cara.query(api.tools.list, {});
    expect(card.bookings).toEqual([
      { startDate: addDays(3), endDate: addDays(5), kind: "booked" },
    ]);
    expect(Object.keys(card.bookings[0]).sort()).toEqual(["endDate", "kind", "startDate"]);
    expect(JSON.stringify(card)).not.toMatch(/example\.com|borrower|lender/i);
  });

  test("list hides other people's pending requests from bookings", async () => {
    const { t, alice, bob, cara } = await setup();
    const tool = await seedTool(t, alice.userId);
    await seedLoan(t, tool, alice.userId, bob.userId, "pending", addDays(1), addDays(2));
    const kinds = async (c: typeof alice) =>
      (await c.query(api.tools.list, {}))[0].bookings.map((b) => b.kind);
    expect(await kinds(cara)).toEqual([]);
    expect(await kinds(bob)).toEqual(["requested"]);
    expect(await kinds(alice)).toEqual(["requested"]);
  });

  test("list with from/to sets freeInRange; without dates it is null", async () => {
    const { t, alice, bob } = await setup();
    const tool = await seedTool(t, alice.userId);
    await seedLoan(t, tool, alice.userId, bob.userId, "approved", addDays(3), addDays(5));
    await seedLoan(t, tool, alice.userId, bob.userId, "pending", addDays(10), addDays(12));
    const free = async (from: string, to: string) =>
      (await bob.query(api.tools.list, { from, to }))[0].freeInRange;
    expect((await bob.query(api.tools.list, {}))[0].freeInRange).toBeNull();
    expect(await free(addDays(5), addDays(6))).toBe(false);
    expect(await free(addDays(6), addDays(8))).toBe(true);
    expect(await free(addDays(10), addDays(11))).toBe(true);
    await expect(bob.query(api.tools.list, { from: addDays(2) })).rejects.toMatchObject({
      data: { code: "INVALID_RANGE" },
    });
    await expect(
      bob.query(api.tools.list, { from: addDays(4), to: addDays(2) }),
    ).rejects.toMatchObject({ data: { code: "INVALID_RANGE" } });
  });

  test("create assigns the next shortCode for the category", async () => {
    const { t, alice } = await setup();
    const input = {
      name: " Saw ",
      category: "hand_tools" as const,
      condition: "good" as const,
      description: " ok ",
    };
    const a = await alice.mutation(api.tools.create, input);
    const b = await alice.mutation(api.tools.create, input);
    await t.run(async (ctx) => {
      await ctx.db.patch(b, { status: "removed" });
    });
    const c = await alice.mutation(api.tools.create, input);
    const docs = await t.run((ctx) => Promise.all([a, b, c].map((id) => ctx.db.get(id))));
    expect(docs.map((d) => d!.shortCode)).toEqual(["HND 001", "HND 002", "HND 003"]);
    expect(docs[0]).toMatchObject({ name: "Saw", description: "ok", status: "active" });
  });

  test("update by non-owner throws FORBIDDEN", async () => {
    const { t, alice, bob } = await setup();
    const tool = await seedTool(t, alice.userId);
    await expect(
      bob.mutation(api.tools.update, { toolId: tool, name: "Mine now" }),
    ).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await alice.mutation(api.tools.update, { toolId: tool, name: "Renamed", category: "garden" });
    const doc = await t.run((ctx) => ctx.db.get(tool));
    expect(doc).toMatchObject({ name: "Renamed", category: "garden", shortCode: "PWR 001" });
  });

  test("remove throws TOOL_ON_LOAN while an approved loan is unreturned", async () => {
    const { t, alice, bob } = await setup();
    const tool = await seedTool(t, alice.userId);
    const loan = await seedLoan(t, tool, alice.userId, bob.userId, "approved", addDays(1), addDays(2));
    await expect(alice.mutation(api.tools.remove, { toolId: tool })).rejects.toMatchObject({
      data: { code: "TOOL_ON_LOAN" },
    });
    await t.run((ctx) => ctx.db.patch(loan, { status: "returned" }));
    await alice.mutation(api.tools.remove, { toolId: tool });
  });

  test("remove soft-deletes and sets pending requests to declined", async () => {
    const { t, alice, bob } = await setup();
    const tool = await seedTool(t, alice.userId);
    const pending = await seedLoan(t, tool, alice.userId, bob.userId, "pending", addDays(1), addDays(2));
    await expect(bob.mutation(api.tools.remove, { toolId: tool })).rejects.toMatchObject({
      data: { code: "FORBIDDEN" },
    });
    await alice.mutation(api.tools.remove, { toolId: tool });
    const { doc, loan } = await t.run(async (ctx) => ({
      doc: await ctx.db.get(tool),
      loan: await ctx.db.get(pending),
    }));
    expect(doc).toMatchObject({ status: "removed", removedBy: alice.userId });
    expect(doc!.removedAt).toBeTypeOf("number");
    expect(loan).toMatchObject({ status: "declined" });
    expect(loan!.decidedAt).toBeTypeOf("number");
    await expect(alice.mutation(api.tools.remove, { toolId: tool })).rejects.toMatchObject({
      data: { code: "NOT_FOUND" },
    });
    expect(await alice.query(api.tools.myListings, {})).toEqual([]);
  });

  test("create rejects unknown category and 281-char description", async () => {
    const { alice } = await setup();
    const ok = {
      name: "Saw",
      category: "other" as const,
      condition: "good" as const,
      description: "x",
    };
    await expect(
      alice.mutation(api.tools.create, { ...ok, category: "bogus" as never }),
    ).rejects.toThrow();
    await expect(
      alice.mutation(api.tools.create, { ...ok, description: "x".repeat(281) }),
    ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
    await expect(
      alice.mutation(api.tools.create, { ...ok, name: " a " }),
    ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
  });
});
