import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { anyApi } from "convex/server";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { asUser, modules } from "./test.setup";
import { NO_EMAIL_CLAIM } from "./lib/errors";

// auth.fixture.ts has two dots, so the glob skips it: register it explicitly.
const withFixture = { ...modules, "./auth.fixture.ts": () => import("./auth.fixture") };
const probes = anyApi["auth.fixture"];

describe("auth wrappers and users", () => {
  test("memberQuery throws UNAUTHENTICATED when signed out", async () => {
    const t = convexTest(schema, withFixture);
    await expect(t.query(probes.memberProbe, {})).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED" },
    });
  });

  test("adminQuery throws FORBIDDEN for role 'user'", async () => {
    const t = convexTest(schema, withFixture);
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
    const t = convexTest(schema, withFixture);
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

  test("ensureUser creates role 'user' even if identity carries a role claim", async () => {
    const t = convexTest(schema, withFixture);
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

    const t = convexTest(schema, withFixture);
    await asUser(t, { name: "Z", email: "z@example.com" });
    await t.mutation(internal.users.setRole, { email: "z@example.com", role: "admin" });
    const rows = await t.run((ctx) => ctx.db.query("users").collect());
    expect(rows[0].role).toBe("admin");
    await expect(
      t.mutation(internal.users.setRole, { email: "no@example.com", role: "admin" }),
    ).rejects.toMatchObject({ data: { code: "NOT_FOUND" } });
  });

  test("an identity with no user row calling a member function → UNAUTHENTICATED", async () => {
    const t = convexTest(schema, withFixture);
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
    const t = convexTest(schema, withFixture);
    expect(await t.query(api.users.viewer, {})).toBeNull();
    const ghost = t.withIdentity({
      tokenIdentifier: "https://issuer|ghost",
      subject: "ghost",
      email: "ghost@example.com",
    });
    expect(await ghost.query(api.users.viewer, {})).toBeNull();
  });

  test("ensureUser with an identity lacking email → UNAUTHENTICATED", async () => {
    const t = convexTest(schema, withFixture);
    const c = t.withIdentity({ tokenIdentifier: "https://issuer|noemail", subject: "noemail" });
    // The client tells this case apart by NO_EMAIL_CLAIM (lib/errors.ts isMissingEmailClaim).
    await expect(c.mutation(api.users.ensureUser, {})).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED", message: NO_EMAIL_CLAIM },
    });
  });

  test("a repeat ensureUser keeps role and trustedLender set by an admin", async () => {
    const t = convexTest(schema, withFixture);
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
    const t = convexTest(schema, withFixture);
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
    const t = convexTest(schema, withFixture);
    const base = { tokenIdentifier: "https://issuer|old", subject: "old", email: "o@example.com" };
    const id = await t.withIdentity(base).mutation(api.users.ensureUser, {});
    await t.run((ctx) => ctx.db.patch(id, { name: "Neighbour" }));
    await t.withIdentity(base).mutation(api.users.ensureUser, {});
    expect((await t.run((ctx) => ctx.db.get(id)))?.name).toBe("");
  });
});
