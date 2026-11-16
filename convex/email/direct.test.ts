import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { asUser, modules, newTest } from "../test.setup";
import { todayUtc } from "../lib/availability";
import { BREVO_URL } from "./brevo";
import { deliverViaBrevo } from "./direct";
import { notificationEmail } from "./templates";

const DAY = 86_400_000;
const d = (n: number) => todayUtc(Date.now() + n * DAY);
const ENV = [
  "EMAIL_TRANSPORT",
  "BREVO_API_KEY",
  "MAIL_FROM",
  "MAIL_FROM_NAME",
  "APP_URL",
  "LENDLOOP_TO_N8N_SECRET",
  "N8N_REQUEST_WEBHOOK_URL",
];
const API_KEY = "xkeysib-test-key-0123456789";
const APP_URL = "https://lendloop.example.test";

let savedEnv: Record<string, string | undefined>;
beforeEach(() => {
  savedEnv = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  process.env.EMAIL_TRANSPORT = "brevo";
  process.env.BREVO_API_KEY = API_KEY;
  process.env.MAIL_FROM = "demo@lendloop.example.test";
  process.env.APP_URL = APP_URL;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const [k, val] of Object.entries(savedEnv)) {
    if (val === undefined) delete process.env[k];
    else process.env[k] = val;
  }
});

async function setup() {
  const t = newTest(modules);
  const alice = await asUser(t, { name: "Alice Anders", email: "alice@example.com" });
  const bob = await asUser(t, { name: "Bob Brown", email: "bob@example.com" });
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
  return { t, alice, bob, toolId };
}
type Ctx = Awaited<ReturnType<typeof setup>>;
const outboxRows = (t: Ctx["t"]) => t.run((ctx) => ctx.db.query("outbox").collect());
const events = (t: Ctx["t"]) => t.run((ctx) => ctx.db.query("automationEvents").collect());
const pendingJobs = async (t: Ctx["t"]) =>
  (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).filter((j) => j.state.kind === "pending");

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}
const ok = async () => new Response(JSON.stringify({ messageId: "<x@y>" }), { status: 201 });

/** Requests the drill as Bob (the email goes to Alice) and runs the first delivery attempt only. */
async function requestAndAttempt(c: Ctx) {
  await c.bob.mutation(api.loans.request, { toolId: c.toolId, startDate: d(1), endDate: d(2) });
  vi.advanceTimersByTime(1);
  await c.t.finishInProgressScheduledFunctions();
  const [row] = await outboxRows(c.t);
  return row;
}

describe("EMAIL_TRANSPORT=brevo: notifications", () => {
  test("sends through Brevo (no n8n config needed) and writes the same rows as n8n's ack", async () => {
    const c = await setup();
    const fetchMock = stubFetch(ok);
    await c.bob.mutation(api.loans.request, { toolId: c.toolId, startDate: d(1), endDate: d(2) });
    await c.t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(BREVO_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "api-key": API_KEY,
      accept: "application/json",
      "content-type": "application/json",
    });
    const [row] = await outboxRows(c.t);
    const expected = notificationEmail(row.payload, APP_URL);
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { email: "demo@lendloop.example.test", name: "LendLoop" },
      to: [{ email: "alice@example.com", name: "Alice" }],
      subject: expected.subject,
      textContent: expected.text,
    });

    expect(row).toMatchObject({ status: "delivered", attempts: 0 });
    const evs = await events(c.t);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      kind: "notification_sent",
      idempotencyKey: `notify:${row.eventId}`,
      detail: "request_created",
      loanId: row.loanId,
    });

    // n8n's own ack for the same event is now a duplicate: it is the same row.
    const ack = await c.t.mutation(internal.automation.endpoints.ackNotification, {
      eventId: row.eventId,
      loanId: row.loanId,
      type: "request_created",
    });
    expect(ack).toEqual({ written: 0, duplicates: 1 });
    expect(await events(c.t)).toHaveLength(1);

    // The loan view carries the activity entry that the UI turns into "Alice was emailed your request".
    const [mine] = await c.bob.query(api.loans.myRequests, {});
    expect(mine.counterpartFirstName).toBe("Alice");
    expect(mine.activity).toMatchObject([{ kind: "notification_sent", detail: "request_created" }]);
  });

  test("a delivered row is never re-sent", async () => {
    const c = await setup();
    const fetchMock = stubFetch(ok);
    await c.bob.mutation(api.loans.request, { toolId: c.toolId, startDate: d(1), endDate: d(2) });
    await c.t.finishAllScheduledFunctions(vi.runAllTimers);
    const [row] = await outboxRows(c.t);
    await c.t.action(internal.automation.outbox.deliver, { outboxId: row._id });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await events(c.t)).toHaveLength(1);
  });

  test("MAIL_FROM_NAME overrides the sender name; a nameless recipient has no name", async () => {
    const c = await setup();
    process.env.MAIL_FROM_NAME = "Neighbourhood Tools";
    await c.t.run((ctx) => ctx.db.patch(c.alice.userId, { name: "" }));
    const fetchMock = stubFetch(ok);
    await requestAndAttempt(c);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.sender.name).toBe("Neighbourhood Tools");
    expect(body.to).toEqual([{ email: "alice@example.com" }]);
    expect(body.textContent).toContain("Hi there,");
  });

  test("non-2xx records HTTP <status> and Brevo's code, redacted, and schedules a retry", async () => {
    const c = await setup();
    stubFetch(
      async () =>
        new Response(JSON.stringify({ code: "unauthorized", message: "key not valid for alice@example.com" }), {
          status: 401,
        }),
    );
    const row = await requestAndAttempt(c);
    expect(row).toMatchObject({ status: "pending", attempts: 1, lastError: "HTTP 401 unauthorized" });
    expect(await pendingJobs(c.t)).toHaveLength(1);
    expect(await events(c.t)).toHaveLength(0);
  });

  test("an error body with no usable code, or an odd one, is just HTTP <status>", async () => {
    for (const body of [
      "<html>bad gateway</html>",
      JSON.stringify({ code: "bob@example.com" }),
      JSON.stringify({ message: "x" }),
    ]) {
      const c = await setup();
      stubFetch(async () => new Response(body, { status: 502 }));
      const row = await requestAndAttempt(c);
      expect(row.lastError).toBe("HTTP 502");
    }
  });

  test("five failures end in 'failed' with the existing schedule", async () => {
    const c = await setup();
    const fetchMock = stubFetch(async () => new Response("{}", { status: 500 }));
    await c.bob.mutation(api.loans.request, { toolId: c.toolId, startDate: d(1), endDate: d(2) });
    await c.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect((await outboxRows(c.t))[0]).toMatchObject({ status: "failed", attempts: 5, lastError: "HTTP 500" });
  });

  test("a thrown error is recorded without the key, the payload or any address", async () => {
    const c = await setup();
    stubFetch(async () => {
      throw new TypeError("fetch failed for alice@example.com");
    });
    const row = await requestAndAttempt(c);
    expect(row.lastError).toBe("TypeError: fetch failed for [redacted]");
    expect(row.lastError).not.toContain(API_KEY);
    expect(await pendingJobs(c.t)).toHaveLength(1);
  });

  test.each(["BREVO_API_KEY", "MAIL_FROM", "APP_URL"])("missing %s fails with config: missing", async (name) => {
    const c = await setup();
    delete process.env[name];
    const fetchMock = stubFetch(ok);
    const row = await requestAndAttempt(c);
    expect(row).toMatchObject({ status: "pending", attempts: 1, lastError: `config: missing ${name}` });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("an unknown transport fails and does not fall back to n8n", async () => {
    const c = await setup();
    process.env.EMAIL_TRANSPORT = "smtp";
    process.env.LENDLOOP_TO_N8N_SECRET = "test-secret-for-outbox-tests-0123456789";
    process.env.N8N_REQUEST_WEBHOOK_URL = "http://n8n.test/webhook/loan-events";
    const fetchMock = stubFetch(ok);
    const row = await requestAndAttempt(c);
    expect(row).toMatchObject({ status: "pending", attempts: 1, lastError: "config: unknown EMAIL_TRANSPORT" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("an unknown event type fails the row and sends nothing", async () => {
    const c = await setup();
    const fetchMock = stubFetch(ok);
    await c.bob.mutation(api.loans.request, { toolId: c.toolId, startDate: d(1), endDate: d(2) });
    const [row] = await outboxRows(c.t);
    // The stored type is validated, so call the delivery function directly with one that has no template.
    const failures: string[] = [];
    const ctx = { runMutation: vi.fn() } as never;
    await deliverViaBrevo(ctx, row._id, { ...row.payload, type: "future_type" } as never, async (e) => {
      failures.push(e);
    });
    expect(failures).toEqual(["Unknown loan event type: future_type"]);
    expect(fetchMock).not.toHaveBeenCalled();
    await c.t.finishAllScheduledFunctions(vi.runAllTimers);
  });
});

describe("EMAIL_TRANSPORT unset or n8n", () => {
  test.each([undefined, "n8n"])("%s posts to n8n and never calls Brevo", async (value) => {
    const c = await setup();
    if (value === undefined) delete process.env.EMAIL_TRANSPORT;
    else process.env.EMAIL_TRANSPORT = value;
    process.env.LENDLOOP_TO_N8N_SECRET = "test-secret-for-outbox-tests-0123456789";
    process.env.N8N_REQUEST_WEBHOOK_URL = "http://n8n.test/webhook/loan-events";
    const fetchMock = stubFetch(async () => new Response("ok", { status: 200 }));
    await c.bob.mutation(api.loans.request, { toolId: c.toolId, startDate: d(1), endDate: d(2) });
    await c.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock.mock.calls.map((x) => x[0])).toEqual(["http://n8n.test/webhook/loan-events"]);
    // n8n acks later over HTTP: nothing is written by the deliver itself.
    expect(await events(c.t)).toHaveLength(0);
    expect((await outboxRows(c.t))[0].status).toBe("delivered");
  });
});
