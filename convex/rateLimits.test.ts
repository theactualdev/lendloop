import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { todayUtc } from "./lib/availability";
import { LIMITS } from "./lib/rateLimits";
import { asUser, newTest } from "./test.setup";

// convex-test runs the @convex-dev/rate-limiter component in-process (registered in
// test.setup.ts's newTest), so these tests exercise the real limiter, not a stub.

const DAY = 86_400_000;
const d = (n: number) => todayUtc(Date.now() + n * DAY);

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as { data?: { code?: string } }).data?.code ?? `non-convex: ${String(e)}`;
  }
  return "no error";
}

async function setup() {
  const t = newTest();
  const alice = await asUser(t, { name: "Alice Anders", email: "alice@example.com" });
  const bob = await asUser(t, { name: "Bob Brown", email: "bob@example.com" });
  const cara = await asUser(t, { name: "Cara Cole", email: "cara@example.com" });
  const toolId = await t.run((ctx) =>
    ctx.db.insert("tools", {
      ownerId: alice.userId, name: "Drill", category: "power_tools", condition: "good",
      description: "d", shortCode: "PWR 001", status: "active",
    }),
  );
  return { t, alice, bob, cara, toolId };
}

describe("limits", () => {
  test("the configured allowances", () => {
    expect(LIMITS["loans.request"]).toMatchObject({ rate: 10, period: 3_600_000 });
    expect(LIMITS["tools.create"]).toMatchObject({ rate: 10, period: DAY });
    expect(LIMITS["users.setMyName"]).toMatchObject({ rate: 20, period: 3_600_000 });
  });
});

describe("loans.request", () => {
  test("the 11th request in the window is RATE_LIMITED", async () => {
    const { alice, bob, toolId } = await setup();
    for (let i = 1; i <= 10; i++) {
      await bob.mutation(api.loans.request, { toolId, startDate: d(i), endDate: d(i) });
    }
    expect(await code(bob.mutation(api.loans.request, { toolId, startDate: d(11), endDate: d(11) }))).toBe("RATE_LIMITED");
    // Nothing was written by the refused call.
    expect(await alice.query(api.loans.incoming, {})).toHaveLength(10);
  });

  test("one member's limit does not touch another's", async () => {
    const { bob, cara, toolId } = await setup();
    for (let i = 1; i <= 10; i++) {
      await bob.mutation(api.loans.request, { toolId, startDate: d(i), endDate: d(i) });
    }
    expect(await code(bob.mutation(api.loans.request, { toolId, startDate: d(11), endDate: d(11) }))).toBe("RATE_LIMITED");
    expect(await code(cara.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(1) }))).toBe("no error");
  });

  test("invalid input and refused requests spend nothing", async () => {
    const { alice, bob, toolId } = await setup();
    const ownTool = await code(alice.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(1) }));
    expect(ownTool).toBe("OWN_TOOL");
    for (let i = 0; i < 12; i++) {
      expect(await code(bob.mutation(api.loans.request, { toolId, startDate: d(-3), endDate: d(-2) }))).toBe("INVALID_RANGE");
    }
    await bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(1) });
    for (let i = 0; i < 12; i++) {
      expect(await code(bob.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(1) }))).toBe("ALREADY_REQUESTED");
    }
    // 1 used; the other 9 are still there.
    for (let i = 2; i <= 10; i++) {
      await bob.mutation(api.loans.request, { toolId, startDate: d(i), endDate: d(i) });
    }
    expect(await code(bob.mutation(api.loans.request, { toolId, startDate: d(11), endDate: d(11) }))).toBe("RATE_LIMITED");
  });

  test("an unauthenticated call is UNAUTHENTICATED, not RATE_LIMITED", async () => {
    const { t, toolId } = await setup();
    expect(await code(t.mutation(api.loans.request, { toolId, startDate: d(1), endDate: d(1) }))).toBe("UNAUTHENTICATED");
  });

  test("reads are never limited", async () => {
    const { bob, toolId } = await setup();
    for (let i = 1; i <= 10; i++) {
      await bob.mutation(api.loans.request, { toolId, startDate: d(i), endDate: d(i) });
    }
    for (let i = 0; i < 15; i++) {
      await bob.query(api.loans.myRequests, {});
      await bob.query(api.tools.list, {});
    }
  });
});

describe("tools.create", () => {
  const input = (i: number) => ({ name: `Tool ${i}`, category: "garden", condition: "good", description: "d" });

  test("the 11th listing in a day is RATE_LIMITED; another member can still list", async () => {
    const { alice, bob } = await setup();
    for (let i = 1; i <= 10; i++) await alice.mutation(api.tools.create, input(i));
    expect(await code(alice.mutation(api.tools.create, input(11)))).toBe("RATE_LIMITED");
    expect(await code(bob.mutation(api.tools.create, input(1)))).toBe("no error");
  });

  test("a rejected listing spends nothing", async () => {
    const { alice } = await setup();
    for (let i = 0; i < 12; i++) {
      expect(await code(alice.mutation(api.tools.create, { ...input(0), name: "   " }))).toBe("INVALID_INPUT");
    }
    for (let i = 1; i <= 10; i++) await alice.mutation(api.tools.create, input(i));
    expect(await code(alice.mutation(api.tools.create, input(11)))).toBe("RATE_LIMITED");
  });

  test("limits are per name: requests do not use up listings", async () => {
    const { bob, toolId } = await setup();
    for (let i = 1; i <= 10; i++) {
      await bob.mutation(api.loans.request, { toolId, startDate: d(i), endDate: d(i) });
    }
    expect(await code(bob.mutation(api.tools.create, input(1)))).toBe("no error");
  });
});

describe("users.setMyName", () => {
  test("the 21st change in an hour is RATE_LIMITED; empty names spend nothing", async () => {
    const { alice, bob } = await setup();
    for (let i = 0; i < 5; i++) {
      expect(await code(alice.mutation(api.users.setMyName, { name: "   " }))).toBe("INVALID_INPUT");
    }
    for (let i = 1; i <= 20; i++) await alice.mutation(api.users.setMyName, { name: `Alice ${i}` });
    expect(await code(alice.mutation(api.users.setMyName, { name: "Alice 21" }))).toBe("RATE_LIMITED");
    expect(await code(bob.mutation(api.users.setMyName, { name: "Bobby" }))).toBe("no error");
  });
});
