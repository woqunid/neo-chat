const DEFAULT_CHAT_PROVIDER_TIMEOUT_MS = 120_000;
const DEFAULT_GROK_SEARCH_TIMEOUT_MS = 60_000;
const DISABLE_TIMEOUT_VALUE = 0;
const MIN_REQUEST_TIMEOUT_MS = 1_000;
const MAX_REQUEST_TIMEOUT_MS = 10 * 60 * 1_000;

function parseTimeoutValue(value: string | undefined): number | null {
  if (!value?.trim()) return null;

  const timeoutMs = Number(value);
  if (!Number.isFinite(timeoutMs)) return null;
  if (timeoutMs === DISABLE_TIMEOUT_VALUE) return DISABLE_TIMEOUT_VALUE;

  return Math.min(
    Math.max(Math.trunc(timeoutMs), MIN_REQUEST_TIMEOUT_MS),
    MAX_REQUEST_TIMEOUT_MS,
  );
}

function getRequestTimeoutMs(
  value: string | undefined,
  defaultTimeoutMs: number,
): number {
  return parseTimeoutValue(value) ?? defaultTimeoutMs;
}

export function getChatProviderTimeoutMs(): number {
  return getRequestTimeoutMs(
    process.env.CHAT_PROVIDER_TIMEOUT_MS,
    DEFAULT_CHAT_PROVIDER_TIMEOUT_MS,
  );
}

export function getGrokSearchTimeoutMs(): number {
  return getRequestTimeoutMs(
    process.env.GROK_SEARCH_TIMEOUT_MS,
    DEFAULT_GROK_SEARCH_TIMEOUT_MS,
  );
}

export function createProviderTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}
