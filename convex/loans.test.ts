import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { asUser, modules } from "./test.setup";
import { todayUtc } from "./lib/availability";
import { EXPIRE_BATCH } from "./loans";

const DAY = 86_400_000;
const d = (n: number) => todayUtc(Date.now() + n * DAY);

type T = TestConvex<typeof schema>;
type Status = "pending" | "approved" | "declined" | "cancelled" | "returned" | "expired";

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

describe("request: one ask per borrower, tool and dates", () => {
  const rows = (t: T) =>
    t.run(async (ctx) => ({
      loans: await ctx.db.query("loans").collect(),
      outbox: await ctx.db.query("outbox").collect(),
    }));

  test("a second identical request → ALREADY_REQUESTED, with no second loan or email", async () => {
    const { t, bob, toolId } = await setup();
    await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(3) });
    expect(
      await code(bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(3) })),
    ).toBe("ALREADY_REQUESTED");
    // Touching a single day counts (inclusive ranges).
    expect(
      await code(bob.mutation(api.loans.request, { toolId, startDate: d(3), endDate: d(5) })),
    ).toBe("ALREADY_REQUESTED");
    const { loans, outbox } = await rows(t);
    expect(loans).toHaveLength(1);
    expect(outbox).toHaveLength(1);
  });

  test("an approved, unreturned loan of the same borrower also blocks; a returned one does not", async () => {
    const { t, alice, bob, toolId } = await setup();
    await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(1), d(4));
    expect(
      await code(bob.mutation(api.loans.request, { toolId, startDate: d(2), endDate: d(3) })),
    ).toBe("ALREADY_REQUESTED");
    await seedLoan(t, toolId, alice.userId, bob.userId, "returned", d(6), d(8));
    expect(
      await code(bob.mutation(api.loans.request, { toolId, startDate: d(7), endDate: d(9) })),
    ).toBe("no error");
  });

  test("a second request on other dates is allowed", async () => {
    const { t, bob, toolId } = await setup();
    await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(3) });
    await bob.mutation(api.loans.request, { toolId, startDate: d(4), endDate: d(5) });
    const { loans, outbox } = await rows(t);
    expect(loans.map((l) => l.status)).toEqual(["pending", "pending"]);
    expect(outbox).toHaveLength(2);
  });

  test("after a decline or a cancel, the same dates can be asked for again", async () => {
    const { t, alice, bob, toolId } = await setup();
    const first = await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(3) });
    await alice.mutation(api.loans.decline, { loanId: first });
    const second = await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(3) });
    await bob.mutation(api.loans.cancel, { loanId: second });
    const third = await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(3) });
    expect((await t.run((ctx) => ctx.db.get(third)))?.status).toBe("pending");
  });

  test("another borrower's request, or the same borrower on another tool, does not block", async () => {
    const { t, alice, bob, cara, toolId } = await setup();
    const otherTool = await t.run((ctx) =>
      ctx.db.insert("tools", {
        ownerId: alice.userId,
        name: "Sander",
        category: "power_tools",
        condition: "good",
        description: "d",
        shortCode: "PWR 002",
        status: "active",
      }),
    );
    await cara.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(3) });
    await bob.mutation(api.loans.request, { toolId: otherTool, startDate: d(1), endDate: d(3) });
    expect(
      await code(bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(3) })),
    ).toBe("no error");
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

  test("approving a request whose dates have passed → REQUEST_EXPIRED, with no email queued", async () => {
    const { alice, bob, toolId, t } = await setup();
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(-3), d(-1));
    expect(await code(alice.mutation(api.loans.approve, { loanId }))).toBe("REQUEST_EXPIRED");
    const { loan, outbox, jobs } = await t.run(async (ctx) => ({
      loan: await ctx.db.get(loanId),
      outbox: await ctx.db.query("outbox").collect(),
      jobs: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(loan?.status).toBe("pending");
    expect(loan?.decidedAt).toBeUndefined();
    expect(outbox).toHaveLength(0);
    expect(jobs).toHaveLength(0);
  });

  test("an expired request can still be declined; one ending today can still be approved", async () => {
    const { alice, bob, toolId, t } = await setup();
    const expired = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(-3), d(-1));
    const endsToday = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(-1), d(0));
    await alice.mutation(api.loans.decline, { loanId: expired });
    await alice.mutation(api.loans.approve, { loanId: endsToday });
    const [a, b, outbox] = await t.run(async (ctx) =>
      Promise.all([ctx.db.get(expired), ctx.db.get(endsToday), ctx.db.query("outbox").collect()]),
    );
    expect(a?.status).toBe("declined");
    expect(b?.status).toBe("approved");
    expect(outbox.map((r) => r.type)).toEqual(["request_declined", "request_approved"]);
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

describe("calling off an approved loan before pickup (R34-1)", () => {
  const outboxOf = (t: T) => t.run((ctx) => ctx.db.query("outbox").collect());
  const statusOf = async (t: T, id: Id<"loans">) => (await t.run((ctx) => ctx.db.get(id)))?.status;

  test("the borrower cancels before the start date: cancelled, and the lender is emailed", async () => {
    const { t, alice, bob, toolId } = await setup();
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(1), d(3));
    await bob.mutation(api.loans.cancel, { loanId });
    expect(await statusOf(t, loanId)).toBe("cancelled");
    const rows = await outboxOf(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "request_cancelled" });
    expect(rows[0].payload.recipient.email).toBe("alice@example.com");
  });

  test("the borrower cannot cancel on the start date or later → LOAN_STARTED", async () => {
    const { t, alice, bob, toolId } = await setup();
    const today = await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(0), d(2));
    const past = await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(-2), d(2));
    expect(await code(bob.mutation(api.loans.cancel, { loanId: today }))).toBe("LOAN_STARTED");
    expect(await code(bob.mutation(api.loans.cancel, { loanId: past }))).toBe("LOAN_STARTED");
    expect(await statusOf(t, today)).toBe("approved");
    expect(await outboxOf(t)).toHaveLength(0);
  });

  test("the lender withdraws before the start date: cancelled, and the borrower is emailed", async () => {
    const { t, alice, bob, toolId } = await setup();
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(1), d(3));
    await alice.mutation(api.loans.withdrawApproval, { loanId });
    expect(await statusOf(t, loanId)).toBe("cancelled");
    const rows = await outboxOf(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "approval_withdrawn" });
    expect(rows[0].payload.recipient.email).toBe("bob@example.com");
  });

  test("an admin may withdraw too", async () => {
    const { t, alice, bob, toolId } = await setup();
    const admin = await asUser(t, { name: "Ada Admin", email: "ada@example.com", role: "admin" });
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(1), d(3));
    await admin.mutation(api.loans.withdrawApproval, { loanId });
    expect(await statusOf(t, loanId)).toBe("cancelled");
  });

  test("the lender cannot withdraw on the start date or later → LOAN_STARTED", async () => {
    const { t, alice, bob, toolId } = await setup();
    const today = await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(0), d(2));
    const past = await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(-3), d(-1));
    expect(await code(alice.mutation(api.loans.withdrawApproval, { loanId: today }))).toBe("LOAN_STARTED");
    expect(await code(alice.mutation(api.loans.withdrawApproval, { loanId: past }))).toBe("LOAN_STARTED");
    expect(await statusOf(t, today)).toBe("approved");
    expect(await outboxOf(t)).toHaveLength(0);
  });

  test("the borrower cannot withdraw, and the lender cannot cancel, an approved loan → FORBIDDEN", async () => {
    const { t, alice, bob, toolId } = await setup();
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(1), d(3));
    expect(await code(bob.mutation(api.loans.withdrawApproval, { loanId }))).toBe("FORBIDDEN");
    expect(await code(alice.mutation(api.loans.cancel, { loanId }))).toBe("FORBIDDEN");
  });

  test("an unrelated user can neither cancel nor withdraw → FORBIDDEN", async () => {
    const { t, alice, bob, cara, toolId } = await setup();
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(1), d(3));
    expect(await code(cara.mutation(api.loans.cancel, { loanId }))).toBe("FORBIDDEN");
    expect(await code(cara.mutation(api.loans.withdrawApproval, { loanId }))).toBe("FORBIDDEN");
    expect(await statusOf(t, loanId)).toBe("approved");
  });

  test("withdrawing a pending loan → INVALID_TRANSITION", async () => {
    const { t, alice, bob, toolId } = await setup();
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(1), d(3));
    expect(await code(alice.mutation(api.loans.withdrawApproval, { loanId }))).toBe("INVALID_TRANSITION");
  });

  test("a cancelled approved loan frees the dates", async () => {
    const { t, alice, bob, cara, toolId } = await setup();
    const loanId = await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(1), d(3));
    await alice.mutation(api.loans.withdrawApproval, { loanId });
    const other = await seedLoan(t, toolId, alice.userId, cara.userId, "pending", d(2), d(3));
    await alice.mutation(api.loans.approve, { loanId: other });
    expect(await statusOf(t, other)).toBe("approved");
  });
});

describe("expireStale (R34-2)", () => {
  const rowsOf = (t: T) =>
    t.run(async (ctx) => ({
      loans: await ctx.db.query("loans").collect(),
      outbox: await ctx.db.query("outbox").collect(),
    }));

  test("pending loans with past end dates expire; today, future and approved loans are untouched; no outbox rows", async () => {
    const { t, alice, bob, toolId } = await setup();
    const past = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(-5), d(-2));
    const yesterday = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(-3), d(-1));
    const endsToday = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(-2), d(0));
    const future = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(1), d(2));
    const approvedPast = await seedLoan(t, toolId, alice.userId, bob.userId, "approved", d(-6), d(-4));
    const declinedPast = await seedLoan(t, toolId, alice.userId, bob.userId, "declined", d(-6), d(-4));

    const res = await t.mutation(internal.loans.expireStale, {});
    expect(res).toEqual({ expired: 2 });

    const { loans, outbox } = await rowsOf(t);
    const status = (id: Id<"loans">) => loans.find((l) => l._id === id)?.status;
    expect(status(past)).toBe("expired");
    expect(status(yesterday)).toBe("expired");
    expect(status(endsToday)).toBe("pending");
    expect(status(future)).toBe("pending");
    expect(status(approvedPast)).toBe("approved");
    expect(status(declinedPast)).toBe("declined");
    expect(loans.find((l) => l._id === past)?.decidedAt).toBeTypeOf("number");
    expect(outbox).toHaveLength(0);
  });

  test("an expired request is terminal and frees the dates to ask again", async () => {
    const { t, alice, bob, toolId } = await setup();
    const id = await seedLoan(t, toolId, alice.userId, bob.userId, "pending", d(-5), d(-2));
    await t.mutation(internal.loans.expireStale, {});
    expect(await code(bob.mutation(api.loans.cancel, { loanId: id }))).toBe("INVALID_TRANSITION");
    expect(await code(alice.mutation(api.loans.approve, { loanId: id }))).toBe("INVALID_TRANSITION");
    expect(await code(alice.mutation(api.loans.decline, { loanId: id }))).toBe("INVALID_TRANSITION");
    const mine = await bob.query(api.loans.myRequests, {});
    expect(mine[0].status).toBe("expired");
  });

  test("a full batch schedules another run", async () => {
    const { t, alice, bob, toolId } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < EXPIRE_BATCH + 1; i++) {
        await ctx.db.insert("loans", {
          toolId, lenderId: alice.userId, borrowerId: bob.userId,
          startDate: d(-5), endDate: d(-2), status: "pending",
        });
      }
    });
    expect(await t.mutation(internal.loans.expireStale, {})).toEqual({ expired: EXPIRE_BATCH });
    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.some((s) => s.name.includes("expireStale"))).toBe(true);
    expect(await t.mutation(internal.loans.expireStale, {})).toEqual({ expired: 1 });
  });
});
