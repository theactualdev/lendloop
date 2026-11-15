import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { asUser, modules } from "./test.setup";
import { todayUtc } from "./lib/availability";

const DAY = 86_400_000;
function daysFromToday(n: number): string {
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
    await seedLoan(t, out, alice.userId, bob.userId, "approved", daysFromToday(-1), daysFromToday(2));
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
    await seedLoan(t, tool, alice.userId, bob.userId, "approved", daysFromToday(3), daysFromToday(5));
    await seedLoan(t, tool, alice.userId, cara.userId, "declined", daysFromToday(6), daysFromToday(7));
    await seedLoan(t, tool, alice.userId, cara.userId, "approved", daysFromToday(40), daysFromToday(41));
    const [card] = await cara.query(api.tools.list, {});
    expect(card.bookings).toEqual([
      { startDate: daysFromToday(3), endDate: daysFromToday(5), kind: "booked" },
    ]);
    expect(Object.keys(card.bookings[0]).sort()).toEqual(["endDate", "kind", "startDate"]);
    expect(JSON.stringify(card)).not.toMatch(/example\.com|borrower|lender/i);
  });

  test("list hides other people's pending requests from bookings", async () => {
    const { t, alice, bob, cara } = await setup();
    const tool = await seedTool(t, alice.userId);
    await seedLoan(t, tool, alice.userId, bob.userId, "pending", daysFromToday(1), daysFromToday(2));
    const kinds = async (c: typeof alice) =>
      (await c.query(api.tools.list, {}))[0].bookings.map((b) => b.kind);
    expect(await kinds(cara)).toEqual([]);
    expect(await kinds(bob)).toEqual(["requested"]);
    expect(await kinds(alice)).toEqual(["requested"]);
  });

  test("list with from/to sets freeInRange; without dates it is null", async () => {
    const { t, alice, bob } = await setup();
    const tool = await seedTool(t, alice.userId);
    await seedLoan(t, tool, alice.userId, bob.userId, "approved", daysFromToday(3), daysFromToday(5));
    await seedLoan(t, tool, alice.userId, bob.userId, "pending", daysFromToday(10), daysFromToday(12));
    const free = async (from: string, to: string) =>
      (await bob.query(api.tools.list, { from, to }))[0].freeInRange;
    expect((await bob.query(api.tools.list, {}))[0].freeInRange).toBeNull();
    expect(await free(daysFromToday(5), daysFromToday(6))).toBe(false);
    expect(await free(daysFromToday(6), daysFromToday(8))).toBe(true);
    expect(await free(daysFromToday(10), daysFromToday(11))).toBe(true);
    await expect(bob.query(api.tools.list, { from: daysFromToday(2) })).rejects.toMatchObject({
      data: { code: "INVALID_RANGE" },
    });
    await expect(
      bob.query(api.tools.list, { from: daysFromToday(4), to: daysFromToday(2) }),
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
    const loan = await seedLoan(t, tool, alice.userId, bob.userId, "approved", daysFromToday(1), daysFromToday(2));
    await expect(alice.mutation(api.tools.remove, { toolId: tool })).rejects.toMatchObject({
      data: { code: "TOOL_ON_LOAN" },
    });
    await t.run((ctx) => ctx.db.patch(loan, { status: "returned" }));
    await alice.mutation(api.tools.remove, { toolId: tool });
  });

  test("remove soft-deletes and sets pending requests to declined", async () => {
    const { t, alice, bob } = await setup();
    const tool = await seedTool(t, alice.userId);
    const pending = await seedLoan(t, tool, alice.userId, bob.userId, "pending", daysFromToday(1), daysFromToday(2));
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

  test("create and update strip control characters from the name and keep the 2-60 rule", async () => {
    const { t, alice } = await setup();
    const base = { category: "garden" as const, condition: "good" as const, description: "" };
    const id = await alice.mutation(api.tools.create, { ...base, name: " Hedge\ttrimmer\u0007 " });
    expect((await t.run((ctx) => ctx.db.get(id)))?.name).toBe("Hedge trimmer");
    await expect(
      alice.mutation(api.tools.create, { ...base, name: "\u0000a\u0007" }),
    ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
    await alice.mutation(api.tools.update, { toolId: id, name: "Sh\u001bears" });
    expect((await t.run((ctx) => ctx.db.get(id)))?.name).toBe("Shears");
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
    ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
    await expect(
      alice.mutation(api.tools.create, { ...ok, description: "x".repeat(281) }),
    ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
    await expect(
      alice.mutation(api.tools.create, { ...ok, name: " a " }),
    ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
  });

  test("shortCode is not reused after a category change", async () => {
    const { t, alice } = await setup();
    const input = {
      name: "Drill",
      category: "power_tools" as const,
      condition: "good" as const,
      description: "",
    };
    const first = await alice.mutation(api.tools.create, input);
    await alice.mutation(api.tools.update, { toolId: first, category: "garden" });
    const second = await alice.mutation(api.tools.create, input);
    const docs = await t.run((ctx) => Promise.all([first, second].map((id) => ctx.db.get(id))));
    expect(docs.map((d) => [d!.category, d!.shortCode])).toEqual([
      ["garden", "PWR 001"],
      ["power_tools", "PWR 002"],
    ]);
  });

  test("shortCode counter is numeric past 999", async () => {
    const { t, alice } = await setup();
    await seedTool(t, alice.userId, { shortCode: "PWR 999" });
    await seedTool(t, alice.userId, { shortCode: "PWR 1000" });
    const id = await alice.mutation(api.tools.create, {
      name: "Saw",
      category: "power_tools",
      condition: "good",
      description: "",
    });
    expect((await t.run((ctx) => ctx.db.get(id)))!.shortCode).toBe("PWR 1001");
  });

  test("update validates like create", async () => {
    const { t, alice } = await setup();
    const tool = await seedTool(t, alice.userId);
    for (const patch of [{ category: "bogus" }, { condition: "bogus" }, { name: " a " }]) {
      await expect(
        alice.mutation(api.tools.update, { toolId: tool, ...patch }),
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
    }
  });

  test("booking window includes today+20 and excludes today+21", async () => {
    const { t, alice, bob } = await setup();
    const tool = await seedTool(t, alice.userId);
    await seedLoan(t, tool, alice.userId, bob.userId, "approved", daysFromToday(20), daysFromToday(21));
    await seedLoan(t, tool, alice.userId, bob.userId, "approved", daysFromToday(21), daysFromToday(22));
    const [card] = await bob.query(api.tools.list, {});
    expect(card.bookings.map((b) => b.startDate)).toEqual([daysFromToday(20)]);
  });

  test("an approved loan starting today makes the tool on_loan", async () => {
    const { t, alice, bob } = await setup();
    const tool = await seedTool(t, alice.userId);
    await seedLoan(t, tool, alice.userId, bob.userId, "approved", daysFromToday(0), daysFromToday(1));
    expect((await bob.query(api.tools.list, {}))[0].availability).toBe("on_loan");
  });
});
