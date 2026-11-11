import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { AUD_CONVEX, signToken } from "./lib/signing";
import { todayUtc } from "./lib/availability";

const SECRET = "test-secret-for-seed-tests-0123456789";
let saved: string | undefined;
beforeEach(() => {
  saved = process.env.N8N_TO_LENDLOOP_SECRET;
  process.env.N8N_TO_LENDLOOP_SECRET = SECRET;
});
afterEach(() => {
  if (saved === undefined) delete process.env.N8N_TO_LENDLOOP_SECRET;
  else process.env.N8N_TO_LENDLOOP_SECRET = saved;
});

const counts = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => ({
    users: (await ctx.db.query("users").collect()).length,
    tools: (await ctx.db.query("tools").collect()).length,
    loans: (await ctx.db.query("loans").collect()).length,
    outbox: (await ctx.db.query("outbox").collect()).length,
  }));

describe("seed:demo", () => {
  test("is idempotent and fires no outbox emails", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.demo, {});
    const first = await counts(t);
    expect(first.users).toBeGreaterThanOrEqual(3);
    expect(first.tools).toBeGreaterThanOrEqual(8);
    expect(first.loans).toBeGreaterThanOrEqual(3);
    expect(first.outbox).toBe(0);
    await t.mutation(internal.seed.demo, {});
    expect(await counts(t)).toEqual(first);
    const users = await t.run((ctx) => ctx.db.query("users").collect());
    expect(users.every((u) => u.email.endsWith("@example.test"))).toBe(true);
    expect(users.filter((u) => u.trustedLender)).toHaveLength(1);
    const codes = (await t.run((ctx) => ctx.db.query("tools").collect())).map((x) => x.shortCode);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("seed:overdueLoan", () => {
  test("creates a loan the overdue route returns", async () => {
    const t = convexTest(schema, modules);
    const loanId = await t.mutation(internal.seed.overdueLoan, { borrowerEmail: "pat@example.test" });
    const token = await signToken(
      { scope: "overdue:read", asOf: todayUtc() },
      { secret: SECRET, audience: AUD_CONVEX },
    );
    const res = await t.fetch("/automation/overdue-loans", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.loans).toHaveLength(1);
    expect(body.loans[0]).toMatchObject({
      loanId,
      borrower: { email: "pat@example.test" },
      daysOverdue: 3,
    });
  });

  test("can be called twice with different borrowers", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.overdueLoan, { borrowerEmail: "a@example.test" });
    await t.mutation(internal.seed.overdueLoan, { borrowerEmail: "not-an-email" });
    const c = await counts(t);
    expect(c.loans).toBe(2);
    expect(c.outbox).toBe(0);
  });
});
