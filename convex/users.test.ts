import { describe, expect, test } from "vitest";
import { anyApi } from "convex/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { asUser, modules, newTest } from "./test.setup";
import { NO_EMAIL_CLAIM } from "./lib/errors";

// auth.fixture.ts has two dots, so the glob skips it: register it explicitly.
const withFixture = { ...modules, "./auth.fixture.ts": () => import("./auth.fixture") };
const probes = anyApi["auth.fixture"];

describe("auth wrappers and users", () => {
  test("memberQuery throws UNAUTHENTICATED when signed out", async () => {
    const t = newTest(withFixture);
    await expect(t.query(probes.memberProbe, {})).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED" },
    });
  });

  test("adminQuery throws FORBIDDEN for role 'user'", async () => {
    const t = newTest(withFixture);
    const alice = await asUser(t, { name: "Alice", email: "alice@example.com" });
    await expect(alice.query(probes.adminProbe, {})).rejects.toMatchObject({
      data: { code: "FORBIDDEN" },
    });
    const admin = await asUser(t, {
      name: "Root",
      email: "root@example.com",
      role: "admin",
    });
    await expect(admin.query(probes.adminProbe, {})).resolves.toBe("ok");
  });

  test("ensureUser is idempotent: two calls → one row", async () => {
    const t = newTest(withFixture);
    const c = t.withIdentity({
      tokenIdentifier: "https://issuer|u1",
      subject: "u1",
      name: "Bob",
      email: "bob@example.com",
    });
    const a = await c.mutation(api.users.ensureUser, {});
    const b = await c.mutation(api.users.ensureUser, {});
    expect(a).toEqual(b);
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    expect(await c.query(api.users.viewer, {})).toEqual({
      _id: a,
      name: "Bob",
      role: "user",
      trustedLender: false,
    });
  });

  test("ensureUser cleans the token's name the way setMyName does, cut to 60 characters", async () => {
    const t = newTest(withFixture);
    const login = (n: number, name: string) =>
      t.withIdentity({ tokenIdentifier: `https://issuer|n${n}`, subject: `n${n}`, name, email: `n${n}@example.com` });
    const nameOf = async (c: ReturnType<typeof login>) => {
      await c.mutation(api.users.ensureUser, {});
      return (await c.query(api.users.viewer, {}))?.name;
    };
    expect(await nameOf(login(1, "  Bo\u0007b \t Smith\n"))).toBe("Bob Smith");
    expect(await nameOf(login(2, "x".repeat(80)))).toBe("x".repeat(60));
  });

  test("ensureUser creates role 'user' even if identity carries a role claim", async () => {
    const t = newTest(withFixture);
    const c = t.withIdentity({
      tokenIdentifier: "https://issuer|u2",
      subject: "u2",
      name: "Eve",
      email: "eve@example.com",
      role: "admin",
    });
    await c.mutation(api.users.ensureUser, {});
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    expect(rows[0].role).toBe("user");
    expect(rows[0].trustedLender).toBe(false);
  });

  // The runtime isInternal flag is relied on deliberately; @ts-expect-error is the stable guard.
  test("setRole is internal: api.users has no setRole", async () => {
    // @ts-expect-error setRole must not be on the public api
    void api.users.setRole;
    const fn = internal.users.setRole;
    expect(fn).toBeDefined();
    const { setRole } = await import("./users");
    expect((setRole as unknown as { isInternal?: boolean }).isInternal).toBe(true);
    expect((setRole as unknown as { isPublic?: boolean }).isPublic).toBeFalsy();

    const t = newTest(withFixture);
    await asUser(t, { name: "Z", email: "z@example.com" });
    await t.mutation(internal.users.setRole, { email: "z@example.com", role: "admin" });
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    expect(rows[0].role).toBe("admin");
    await expect(
      t.mutation(internal.users.setRole, { email: "no@example.com", role: "admin" }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  test("an identity with no user row calling a member function → UNAUTHENTICATED", async () => {
    const t = newTest(withFixture);
    const ghost = t.withIdentity({
      tokenIdentifier: "https://issuer|ghost",
      subject: "ghost",
      name: "Ghost",
      email: "ghost@example.com",
    });
    await expect(ghost.query(probes.memberProbe, {})).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED", message: "user not provisioned" },
    });
  });

  test("viewer is null when signed out and when the identity has no row", async () => {
    const t = newTest(withFixture);
    expect(await t.query(api.users.viewer, {})).toBeNull();
    const ghost = t.withIdentity({
      tokenIdentifier: "https://issuer|ghost",
      subject: "ghost",
      email: "ghost@example.com",
    });
    expect(await ghost.query(api.users.viewer, {})).toBeNull();
  });

  test("ensureUser with an identity lacking email → UNAUTHENTICATED", async () => {
    const t = newTest(withFixture);
    const c = t.withIdentity({ tokenIdentifier: "https://issuer|noemail", subject: "noemail" });
    // The client tells this case apart by NO_EMAIL_CLAIM (lib/errors.ts isMissingEmailClaim).
    await expect(c.mutation(api.users.ensureUser, {})).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED", message: NO_EMAIL_CLAIM },
    });
  });

  test("a repeat ensureUser keeps role and trustedLender set by an admin", async () => {
    const t = newTest(withFixture);
    const c = t.withIdentity({
      tokenIdentifier: "https://issuer|u3",
      subject: "u3",
      name: "Ann",
      email: "ann@example.com",
    });
    const id = await c.mutation(api.users.ensureUser, {});
    await t.run((ctx) => ctx.db.patch(id, { role: "admin", trustedLender: true }));
    await c.mutation(api.users.ensureUser, {});
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ role: "admin", trustedLender: true });
  });

  test("ensureUser stores no placeholder when the identity has no name, and a later name updates it", async () => {
    const t = newTest(withFixture);
    const base = { tokenIdentifier: "https://issuer|nameless", subject: "nameless", email: "n@example.com" };
    const id = await t.withIdentity(base).mutation(api.users.ensureUser, {});
    expect((await t.run((ctx) => ctx.db.get(id)))?.name).toBe("");
    expect((await t.withIdentity(base).query(api.users.viewer, {}))?.name).toBe("");

    await t.withIdentity({ ...base, name: "Nia Lee" }).mutation(api.users.ensureUser, {});
    expect((await t.run((ctx) => ctx.db.get(id)))?.name).toBe("Nia Lee");

    // givenName alone is enough.
    const g = { tokenIdentifier: "https://issuer|given", subject: "given", email: "g@example.com", givenName: "Gus" };
    const gid = await t.withIdentity(g).mutation(api.users.ensureUser, {});
    expect((await t.run((ctx) => ctx.db.get(gid)))?.name).toBe("Gus");
  });

  test("an old 'Neighbour' placeholder row is cleared on the next ensureUser", async () => {
    const t = newTest(withFixture);
    const base = { tokenIdentifier: "https://issuer|old", subject: "old", email: "o@example.com" };
    const id = await t.withIdentity(base).mutation(api.users.ensureUser, {});
    await t.run((ctx) => ctx.db.patch(id, { name: "Neighbour" }));
    await t.withIdentity(base).mutation(api.users.ensureUser, {});
    expect((await t.run((ctx) => ctx.db.get(id)))?.name).toBe("");
  });

  test("ensureUser keeps a stored name when the token has no name claim", async () => {
    const t = newTest(withFixture);
    const base = { tokenIdentifier: "https://issuer|keep", subject: "keep", email: "k@example.com" };
    const id = await t.withIdentity({ ...base, name: "Kay Doe" }).mutation(api.users.ensureUser, {});
    await t.withIdentity(base).mutation(api.users.ensureUser, {});
    expect((await t.run((ctx) => ctx.db.get(id)))?.name).toBe("Kay Doe");
  });

  describe("setMyName", () => {
    const setup = async () => {
      const t = newTest(withFixture);
      const alice = await asUser(t, { name: "Alice", email: "alice@example.com" });
      return { t, alice };
    };

    test("signed out gives UNAUTHENTICATED", async () => {
      const t = newTest(withFixture);
      await expect(t.mutation(api.users.setMyName, { name: "X" })).rejects.toMatchObject({
        data: { code: "UNAUTHENTICATED" },
      });
    });

    test("sets the caller's own name", async () => {
      const { alice } = await setup();
      await alice.mutation(api.users.setMyName, { name: "Alice Smith" });
      expect((await alice.query(api.users.viewer, {}))?.name).toBe("Alice Smith");
    });

    test("trims and collapses whitespace", async () => {
      const { alice } = await setup();
      await alice.mutation(api.users.setMyName, { name: "  Alice \t  Q\n Smith  " });
      expect((await alice.query(api.users.viewer, {}))?.name).toBe("Alice Q Smith");
    });

    test("empty and whitespace-only names give INVALID_INPUT; a longer name is cut to 60 characters", async () => {
      const { alice } = await setup();
      for (const name of ["", "   "]) {
        await expect(alice.mutation(api.users.setMyName, { name })).rejects.toMatchObject({
          data: { code: "INVALID_INPUT" },
        });
      }
      const stored = async (name: string) => {
        await alice.mutation(api.users.setMyName, { name });
        return (await alice.query(api.users.viewer, {}))?.name;
      };
      expect(await stored("a".repeat(60))).toBe("a".repeat(60));
      expect(await stored("b".repeat(61))).toBe("b".repeat(60));
      // The cut can land on a space; the result is trimmed again.
      expect(await stored(`${"c".repeat(59)} def`)).toBe("c".repeat(59));
    });

    test("a tab or newline between words becomes one space", async () => {
      const { alice } = await setup();
      await alice.mutation(api.users.setMyName, { name: "Alice\nQ\tSmith" });
      expect((await alice.query(api.users.viewer, {}))?.name).toBe("Alice Q Smith");
    });

    test("strips control characters", async () => {
      const { alice } = await setup();
      await alice.mutation(api.users.setMyName, { name: "Al\u0000ice\u0007 S\u001bmith" });
      expect((await alice.query(api.users.viewer, {}))?.name).toBe("Alice Smith");
      await expect(
        alice.mutation(api.users.setMyName, { name: "\u0000\u0007" }),
      ).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
    });

    test("cannot change role or trustedLender, and leaves other rows untouched", async () => {
      const { t, alice } = await setup();
      await asUser(t, { name: "Bob", email: "bob@example.com", role: "admin" });
      const before = await t.run((ctx) => ctx.db.query("users").collect());
      await alice.mutation(api.users.setMyName, { name: "Alicia" });
      const after = await t.run((ctx) => ctx.db.query("users").collect());
      expect(after).toHaveLength(2);
      for (const row of before) {
        const now = after.find((r) => r._id === row._id)!;
        expect(now).toEqual(row.email === "alice@example.com" ? { ...row, name: "Alicia" } : row);
      }
    });
  });
});

describe("deleteMember (internal)", () => {
  const seedFor = async (t: ReturnType<typeof newTest>, ownerId: Id<"users">, borrowerId: Id<"users">, tag: string) =>
    t.run(async (ctx) => {
      const toolId = await ctx.db.insert("tools", {
        ownerId, name: `Tool ${tag}`, category: "garden", condition: "good", description: "d",
        shortCode: `GRD ${tag}`, status: "active",
      });
      const loanId = await ctx.db.insert("loans", {
        toolId, lenderId: ownerId, borrowerId, startDate: "2026-11-01", endDate: "2026-11-02", status: "returned",
      });
      await ctx.db.insert("outbox", {
        eventId: `e-${tag}`, loanId, type: "request_created", status: "delivered", attempts: 1,
        payload: {
          eventId: `e-${tag}`, type: "request_created", loanId,
          recipient: { email: "x@example.com", firstName: "X" }, tool: { name: "T" },
          startDate: "2026-11-01", endDate: "2026-11-02",
        },
      });
      await ctx.db.insert("automationEvents", { loanId, kind: "notification_sent", idempotencyKey: `k-${tag}`, at: 1 });
      return { toolId, loanId };
    });
  const counts = (t: ReturnType<typeof newTest>) =>
    t.run(async (ctx) => ({
      users: (await ctx.db.query("users").collect()).length,
      tools: (await ctx.db.query("tools").collect()).length,
      loans: (await ctx.db.query("loans").collect()).length,
      outbox: (await ctx.db.query("outbox").collect()).length,
      events: (await ctx.db.query("automationEvents").collect()).length,
    }));

  test("deletes the member's tools, loans (lender and borrower), outbox and events; others untouched", async () => {
    const t = newTest();
    const ann = await asUser(t, { name: "Ann", email: "ann@example.com" });
    const ben = await asUser(t, { name: "Ben", email: "ben@example.com" });
    const cat = await asUser(t, { name: "Cat", email: "cat@example.com" });
    await seedFor(t, ann.userId, ben.userId, "a"); // Ann lends to Ben
    await seedFor(t, ben.userId, ann.userId, "b"); // Ann borrows from Ben
    const keep = await seedFor(t, ben.userId, cat.userId, "c"); // unrelated
    expect(await counts(t)).toEqual({ users: 3, tools: 3, loans: 3, outbox: 3, events: 3 });

    const res = await t.mutation(internal.users.deleteMember, { email: "ann@example.com" });
    expect(res).toEqual({ tools: 1, loans: 2, outbox: 2, events: 2 });
    expect(await counts(t)).toEqual({ users: 2, tools: 2, loans: 1, outbox: 1, events: 1 });
    expect(await t.run((ctx) => ctx.db.get(keep.loanId))).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.get(ann.userId))).toBeNull();
  });

  test("an unknown email is NOT_FOUND", async () => {
    const t = newTest();
    await expect(t.mutation(internal.users.deleteMember, { email: "nobody@example.com" })).rejects.toMatchObject({
      data: { code: "NOT_FOUND" },
    });
  });

  test("is not on the client api (type-level)", () => {
    // @ts-expect-error deleteMember is internal, so it is absent from the public api.
    void (() => api.users.deleteMember);
  });
});
