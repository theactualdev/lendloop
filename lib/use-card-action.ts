"use client";

import { useRef, useState } from "react";
import { toastError } from "@/lib/errors";

/**
 * Runs one mutation at a time for a card or row. A ref guards the gap before
 * React re-renders, so a double click cannot submit twice; `busy` disables the
 * buttons. Errors go to a toast through messageFor. `run` resolves to whether
 * the action succeeded.
 */
export function useCardAction() {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function run(action: () => Promise<unknown>, onSuccess: () => void): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      await action();
      onSuccess();
      return true;
    } catch (error) {
      toastError(error);
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, run };
}
