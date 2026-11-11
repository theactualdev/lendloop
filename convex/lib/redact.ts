const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/** Replaces every email-shaped substring with "[redacted]". */
export function redactEmails(s: string): string {
  return s.replace(EMAIL, "[redacted]");
}
