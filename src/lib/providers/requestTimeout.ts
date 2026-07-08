const DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 30_000;
const DISABLE_TIMEOUT_VALUE = 0;
const MIN_PROVIDER_REQUEST_TIMEOUT_MS = 1_000;
const MAX_PROVIDER_REQUEST_TIMEOUT_MS = 10 * 60 * 1_000;

function parseTimeoutValue(value: string | undefined): number | null {
  if (!value?.trim()) return null;

  const timeoutMs = Number(value);
  if (!Number.isFinite(timeoutMs)) return null;
  if (timeoutMs === DISABLE_TIMEOUT_VALUE) return DISABLE_TIMEOUT_VALUE;

  return Math.min(
    Math.max(Math.trunc(timeoutMs), MIN_PROVIDER_REQUEST_TIMEOUT_MS),
    MAX_PROVIDER_REQUEST_TIMEOUT_MS,
  );
}

export function getProviderRequestTimeoutMs(): number {
  return (
    parseTimeoutValue(process.env.PROVIDER_REQUEST_TIMEOUT_MS) ??
    DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS
  );
}

export function createProviderTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}
