import { ResponseTimeoutError } from "../errors";
import { DEFAULT_TIMEOUT_MS } from "./safeFetchTypes";

export interface SafeFetchLifecycle {
  readonly timeoutMs: number;
  readonly timeoutSignal: AbortSignal;
  readonly signal: AbortSignal;
  cleanup(): void;
}

function abortFrom(source: AbortSignal, target: AbortController): void {
  target.abort(source.reason || createAbortError());
}

export function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("Response read aborted", "AbortError");
  }
  const error = new Error("Response read aborted");
  error.name = "AbortError";
  return error;
}

function mergeAbortSignals(
  timeoutSignal: AbortSignal,
  callerSignal?: AbortSignal | null,
): { signal: AbortSignal; cleanup: () => void } {
  if (!callerSignal) return { signal: timeoutSignal, cleanup: () => {} };
  const controller = new AbortController();
  const abortTimeout = () => abortFrom(timeoutSignal, controller);
  const abortCaller = () => abortFrom(callerSignal, controller);
  if (callerSignal.aborted) abortCaller();
  else if (timeoutSignal.aborted) abortTimeout();
  else {
    timeoutSignal.addEventListener("abort", abortTimeout, { once: true });
    callerSignal.addEventListener("abort", abortCaller, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      timeoutSignal.removeEventListener("abort", abortTimeout);
      callerSignal.removeEventListener("abort", abortCaller);
    },
  };
}

export function createSafeFetchLifecycle(
  requestedTimeoutMs?: number,
  callerSignal?: AbortSignal | null,
): SafeFetchLifecycle {
  const timeoutMs = requestedTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutController = new AbortController();
  const timer =
    timeoutMs > 0
      ? setTimeout(
          () => timeoutController.abort(new ResponseTimeoutError(timeoutMs)),
          timeoutMs,
        )
      : undefined;
  const merged =
    timeoutMs === 0 && callerSignal
      ? { signal: callerSignal, cleanup: () => {} }
      : mergeAbortSignals(timeoutController.signal, callerSignal);
  let cleaned = false;
  return {
    timeoutMs,
    timeoutSignal: timeoutController.signal,
    signal: merged.signal,
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      if (timer) clearTimeout(timer);
      merged.cleanup();
    },
  };
}

export function getAbortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : createAbortError();
}

export function throwIfLifecycleTimedOut(lifecycle: SafeFetchLifecycle): void {
  if (!lifecycle.timeoutSignal.aborted) return;
  const reason = lifecycle.timeoutSignal.reason;
  throw reason instanceof ResponseTimeoutError
    ? reason
    : new ResponseTimeoutError(lifecycle.timeoutMs);
}
