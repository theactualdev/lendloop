// @vitest-environment node
// (node, not edge-runtime: this file reads the workflow JSON and evaluates its expressions)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { loanEventType, type NotificationPayload } from "../automation/payload";
import { adminAlertEmail, notificationEmail, reminderEmail } from "./templates";

/*
 * Parity with n8n. The n8n expressions are plain JavaScript (template literals over
 * $json / $env), so they are evaluated as they are rather than re-typed: a tiny
 * evaluator takes a node parameter such as "={{ `Hi ${$json.x}` }}" or
 * "=[LendLoop] Failed: {{ $json.workflow }}", runs each {{ }} with only $json and
 * $env in scope, and joins the pieces. Edit a Compose node in n8n/workflows/*.json
 * and these tests fail until convex/email/templates.ts says the same thing.
 */

const APP_URL = "https://lendloop.example.test";

function workflow(file: string): { nodes: { name: string; parameters: Record<string, unknown> }[] } {
  return JSON.parse(readFileSync(resolve(__dirname, "../../n8n/workflows", file), "utf8"));
}
function nodeParams(file: string, name: string): Record<string, unknown> {
  const node = workflow(file).nodes.find((n) => n.name === name);
  if (!node) throw new Error(`no node "${name}" in ${file}`);
  return node.parameters;
}

/** Evaluates one n8n parameter value. A value without the leading "=" is a literal. */
function evalN8n(value: unknown, scope: { $json: unknown; $env: Record<string, string> }): string {
  if (typeof value !== "string") throw new Error("expected a string parameter");
  if (!value.startsWith("=")) return value;
  return value.slice(1).replace(/\{\{([\s\S]*?)\}\}/g, (_m, expr: string) => {
    const fn = new Function("$json", "$env", `"use strict"; return (${expr});`);
    return String(fn(scope.$json, scope.$env));
  });
}

/** The Set node's assignments, evaluated, by name. */
function composed(file: string, node: string, scope: Parameters<typeof evalN8n>[1]): Record<string, string> {
  const { assignments } = nodeParams(file, node).assignments as { assignments: { name: string; value: string }[] };
  return Object.fromEntries(assignments.map((a) => [a.name, evalN8n(a.value, scope)]));
}

const EVENT_TYPES = loanEventType.members.map((m) => m.value);

function payload(type: NotificationPayload["type"], firstName: string, toolName = "Cordless drill"): NotificationPayload {
  return {
    eventId: "evt-1",
    type,
    loanId: "loan-1" as NotificationPayload["loanId"],
    recipient: { email: "ada@example.com", firstName },
    tool: { name: toolName },
    startDate: "2026-03-10",
    endDate: "2026-03-12",
  };
}

describe("templates match the n8n workflows", () => {
  test("every event type has exactly one Compose node, and the other way round", () => {
    const names = workflow("request-notification.json")
      .nodes.map((n) => n.name)
      .filter((n) => n.startsWith("Compose "))
      .map((n) => n.slice("Compose ".length));
    expect(names.sort()).toEqual([...EVENT_TYPES].sort());
  });

  for (const type of EVENT_TYPES) {
    for (const firstName of ["Ada", ""]) {
      test(`${type}, first name ${JSON.stringify(firstName)}`, () => {
        const p = payload(type, firstName, "Ladder & `tools` ${x}");
        const n8n = composed("request-notification.json", `Compose ${type}`, { $json: { payload: p }, $env: { APP_URL } });
        expect(notificationEmail(p, APP_URL)).toEqual({ subject: n8n.subject, text: n8n.text });
      });
    }
  }

  test("literal copy of one of them, so the evaluator itself is checked too", () => {
    expect(notificationEmail(payload("approval_withdrawn", ""), APP_URL)).toEqual({
      subject: "Your loan was cancelled: Cordless drill",
      text:
        "Hi there,\n\nThe lender can no longer lend you the Cordless drill for 2026-03-10 to 2026-03-12, so the loan is cancelled.\n\n" +
        `Browse the board for another: ${APP_URL}/board\n`,
    });
  });

  test("an unknown event type throws and produces no email", () => {
    const bad = { ...payload("request_created", "Ada"), type: "something_new" } as unknown as NotificationPayload;
    expect(() => notificationEmail(bad, APP_URL)).toThrow("Unknown loan event type: something_new");
  });

  test.each([
    [1, "Ada"],
    [2, ""],
    [30, "Ada"],
  ])("overdue reminder, %i day(s) overdue, first name %j", (daysOverdue, firstName) => {
    const loan = { borrower: { email: "bob@example.com", firstName }, toolName: "Cordless drill", endDate: "2026-03-10", daysOverdue };
    const n8n = {
      subject: evalN8n(nodeParams("overdue-reminders.json", "Send reminder").subject, { $json: loan, $env: { APP_URL } }),
      text: evalN8n(nodeParams("overdue-reminders.json", "Send reminder").text, { $json: loan, $env: { APP_URL } }),
    };
    expect(reminderEmail(loan, APP_URL)).toEqual(n8n);
  });

  test.each([[""], ["https://n8n.example.test/execution/9"]])("admin alert, execution url %j", (url) => {
    const a = { workflow: "overdue-reminders (direct)", executionId: "direct-reminders:2026-03-10", node: "Send reminder", message: "1 of 2 reminders failed", url };
    const params = nodeParams("error-handler.json", "Email admin");
    const scope = { $json: a, $env: { APP_URL } };
    expect(adminAlertEmail(a)).toEqual({ subject: evalN8n(params.subject, scope), text: evalN8n(params.text, scope) });
    // Without a url the n8n template and ours both leave the line out.
    expect(adminAlertEmail({ ...a, url: undefined })).toEqual(adminAlertEmail({ ...a, url: "" }));
  });
});
