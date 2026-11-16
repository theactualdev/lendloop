import { postSignal } from "../lib/postSignal";
import { redactEmails } from "../lib/redact";

/*
 * Brevo's transactional email API, plain text only (the n8n emails are plain text).
 * Used from actions only: it calls fetch. Never logs, and never puts the API key,
 * the recipient's address or the message in an error string.
 */

export const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 10_000;
const ERROR_MAX = 300;

export type BrevoConfig = { apiKey: string; from: string; fromName: string; appUrl: string };

/** Reads the Convex env. `missing` names the first absent variable, never a value. */
export function readBrevoConfig(): { config: BrevoConfig } | { missing: string } {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { missing: "BREVO_API_KEY" };
  const from = process.env.MAIL_FROM;
  if (!from) return { missing: "MAIL_FROM" };
  const appUrl = process.env.APP_URL;
  if (!appUrl) return { missing: "APP_URL" };
  return { config: { apiKey, from, fromName: process.env.MAIL_FROM_NAME || "LendLoop", appUrl } };
}

export type SendResult = { ok: true } | { ok: false; error: string };

export async function sendBrevoEmail(
  config: Pick<BrevoConfig, "apiKey" | "from" | "fromName">,
  mail: { to: { email: string; name?: string }; subject: string; text: string },
): Promise<SendResult> {
  const { signal, done } = postSignal(TIMEOUT_MS);
  try {
    const res = await fetch(BREVO_URL, {
      method: "POST",
      headers: {
        "api-key": config.apiKey,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: config.from, name: config.fromName },
        to: [mail.to.name ? { email: mail.to.email, name: mail.to.name } : { email: mail.to.email }],
        subject: mail.subject,
        textContent: mail.text,
      }),
      signal,
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: redactEmails(`HTTP ${res.status}${await errorCode(res)}`).slice(0, ERROR_MAX) };
  } catch (e) {
    // Only the error's name and message: never the key, the body or the recipient.
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : "unknown error";
    return { ok: false, error: redactEmails(msg).slice(0, ERROR_MAX) };
  } finally {
    done();
  }
}

/** Brevo's error body is {"code": "...", "message": "..."}. Only a short, plain code is used. */
async function errorCode(res: Response): Promise<string> {
  try {
    const code = ((await res.json()) as { code?: unknown } | null)?.code;
    return typeof code === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(code) ? ` ${code}` : "";
  } catch {
    return "";
  }
}
