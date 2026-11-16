/** An abort signal that fires after `ms`, for outgoing HTTP calls from actions. */
export function postSignal(ms: number): { signal: AbortSignal; done: () => void } {
  if (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal) {
    return { signal: AbortSignal.timeout(ms), done: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}
