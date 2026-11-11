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

async function setup() {
  const t = convexTest(schema, modules);
  const alice = await asUser(t, { name: "Alice Anders", email: "alice@example.com" });
  const bob = await asUser(t, { name: "Bob Brown", email: "bob@example.com" });
  const cara = await asUser(t, { name: "Cara Cole", email: "cara@example.com" });
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
  return { t, alice, bob, cara, toolId };
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

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const data = (e as { data?: { code?: string } }).data;
    return data?.code ?? `non-convex: ${String(e)}`;
  }
  return "no error";
}

describe("request", () => {
  test("request on own tool → OWN_TOOL", async () => {
    const { alice, toolId } = await setup();
    expect(
      await code(alice.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(2) })),
    ).toBe("OWN_TOOL");
  });

  test("request with past start or end < start → INVALID_RANGE", async () => {
    const { bob, toolId } = await setup();
    expect(
      await code(bob.mutation(api.loans.request, { toolId, startDate: d(-1), endDate: d(2) })),
    ).toBe("INVALID_RANGE");
    expect(
      await code(bob.mutation(api.loans.request, { toolId, startDate: d(3), endDate: d(2) })),
    ).toBe("INVALID_RANGE");
    expect(
      await code(bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(40) })),
    ).toBe("INVALID_RANGE");
  });

  test("request creates a pending loan for the tool owner; removed tool → NOT_FOUND", async () => {
    const { t, alice, bob, toolId } = await setup();
    const id = await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(3) });
    const loan = await t.run((ctx) => ctx.db.get(id));
    expect(loan).toMatchObject({ status: "pending", lenderId: alice.userId, borrowerId: bob.userId });
    await t.run((ctx) => ctx.db.patch(toolId, { status: "removed" }));
    expect(
      await code(bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(3) })),
    ).toBe("NOT_FOUND");
  });

  test("a request overlapping an approved loan is allowed and stays pending", async () => {
    const { t, alice, bob, cara, toolId } = await setup();
    await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(2), d(5));
    const id = await cara.mutation(api.loans.request, { toolId, startDate: d(3), endDate: d(4) });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe("pending");
  });
});

describe("decisions", () => {
  test("borrower cannot approve own request → FORBIDDEN", async () => {
    const { alice, bob, toolId, t } = await setup();
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(1), d(2));
    expect(await code(bob.mutation(api.loans.approve, { loanId }))).toBe("FORBIDDEN");
  });

  test("unrelated user cannot decline → FORBIDDEN", async () => {
    const { alice, bob, cara, toolId, t } = await setup();
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(1), d(2));
    expect(await code(cara.mutation(api.loans.decline, { loanId }))).toBe("FORBIDDEN");
    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.status).toBe("pending");
  });

  test("lender approves and declines; borrower cancels; timestamps set", async () => {
    const { alice, bob, toolId, t } = await setup();
    const a = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(1), d(2));
    const b = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(5), d(6));
    const c = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(8), d(9));
    await alice.mutation(api.loans.approve, { loanId: a });
    await alice.mutation(api.loans.decline, { loanId: b });
    await bob.mutation(api.loans.cancel, { loanId: c });
    const [la, lb, lc] = await t.run((ctx) =>
      Promise.all([ctx.db.get(a), ctx.db.get(b), ctx.db.get(c)]),
    );
    expect(la?.status).toBe("approved");
    expect(lb?.status).toBe("declined");
    expect(lc?.status).toBe("cancelled");
    expect(la?.decidedAt).toBeTypeOf("number");
    expect(lb?.decidedAt).toBeTypeOf("number");
    expect(lc?.decidedAt).toBeTypeOf("number");
    await alice.mutation(api.loans.markReturned, { loanId: a });
    const ra = await t.run((ctx) => ctx.db.get(a));
    expect(ra?.status).toBe("returned");
    expect(ra?.returnedAt).toBeTypeOf("number");
  });

  test("missing loan → NOT_FOUND", async () => {
    const { alice, bob, toolId, t } = await setup();
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(1), d(2));
    await t.run((ctx) => ctx.db.delete(loanId));
    expect(await code(alice.mutation(api.loans.approve, { loanId }))).toBe("NOT_FOUND");
  });

  test("approve rejects overlapping range with TOOL_UNAVAILABLE", async () => {
    const { alice, bob, cara, toolId, t } = await setup();
    await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(2), d(5));
    const loanId = await seedLoan(t, toolId, alice.userId, cara.userId, "pending", d(5), d(7));
    expect(await code(alice.mutation(api.loans.approve, { loanId }))).toBe("TOOL_UNAVAILABLE");
    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.status).toBe("pending");
  });

  test("approve after cancel → INVALID_TRANSITION", async () => {
    const { alice, bob, toolId, t } = await setup();
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(1), d(2));
    await bob.mutation(api.loans.cancel, { loanId });
    expect(await code(alice.mutation(api.loans.approve, { loanId }))).toBe("INVALID_TRANSITION");
  });

  test("markReturned on pending → INVALID_TRANSITION", async () => {
    const { alice, bob, toolId, t } = await setup();
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(1), d(2));
    expect(await code(alice.mutation(api.loans.markReturned, { loanId }))).toBe(
      "INVALID_TRANSITION",
    );
  });

  test("admin may mark returned", async () => {
    const { alice, bob, toolId, t } = await setup();
    const admin = await asUser(t, { name: "Ada Admin", email: "ada@example.com", role: "admin" });
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(-2), d(1));
    await admin.mutation(api.loans.markReturned, { loanId });
    const loan = await t.run((ctx) => ctx.db.get(loanId));
    expect(loan?.status).toBe("returned");
    expect(loan?.returnedAt).toBeTypeOf("number");
  });
});

describe("inboxes", () => {
  test("incoming lists only loans on viewer tools; myRequests only viewer borrowing", async () => {
    const { alice, bob, cara, toolId, t } = await setup();
    const caraTool = await t.run((ctx) =>
      ctx.db.insert("tools", {
        ownerId: cara.userId,
        name: "Saw",
        category: "power_tools",
        condition: "good",
        description: "d",
        shortCode: "PWR 002",
        status: "active",
      }),
    );
    await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(1), d(2));
    await seedLoan(t, caraTool, cara.userId, alice.userId, "pending", d(1), d(2));

    const incoming = await alice.query(api.loans.incoming, {});
    expect(incoming).toHaveLength(1);
    expect(incoming[0]).toMatchObject({
      counterpartFirstName: "Bob",
      tool: { name: "Drill", shortCode: "PWR 001" },
    });

    const mine = await alice.query(api.loans.myRequests, {});
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      counterpartFirstName: "Cara",
      tool: { name: "Saw" },
      overdue: false,
    });
    expect(mine[0]).not.toHaveProperty("clash");
    expect(await bob.query(api.loans.incoming, {})).toHaveLength(0);
    expect(JSON.stringify([incoming, mine])).not.toMatch(/example\.com|tokenIdentifier/);
  });

  test("incoming sets clash on a pending request that overlaps an approved loan", async () => {
    const { alice, bob, cara, toolId, t } = await setup();
    await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(2), d(4));
    await seedLoan(t, toolId, alice.userId, cara.userId, "pending", d(3), d(6));
    await seedLoan(t, toolId, alice.userId, cara.userId, "pending", d(10), d(11));
    const items = await alice.query(api.loans.incoming, {});
    const clashing = items.find((i) => i.status === "pending" && i.startDate === d(3));
    const free = items.find((i) => i.startDate === d(10));
    const approved = items.find((i) => i.status === "approved");
    expect(clashing?.clash).toEqual({ borrowerFirstName: "Bob", until: d(4) });
    expect(free?.clash).toBeNull();
    expect(approved?.clash).toBeNull();
  });

  test("incoming clash reports the overlapping approved loan with the latest endDate", async () => {
    const { alice, bob, cara, toolId, t } = await setup();
    const dan = await asUser(t, { name: "Dan Dale", email: "dan@example.com" });
    await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(2), d(4));
    await seedLoan(t, toolId, alice.userId, dan.userId, "approved", d(5), d(8));
    await seedLoan(t, toolId, alice.userId, cara.userId, "pending", d(3), d(7));
    const items = await alice.query(api.loans.incoming, {});
    const pending = items.find((i) => i.status === "pending");
    expect(pending?.clash).toEqual({ borrowerFirstName: "Dan", until: d(8) });
  });

  test("overdue is true for an approved loan past its end date", async () => {
    const { alice, bob, toolId, t } = await setup();
    await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(-5), d(-1));
    const [item] = await bob.query(api.loans.myRequests, {});
    expect(item.overdue).toBe(true);
    expect(item).toMatchObject({ activity: [], deliveryFailed: false });
  });
});
