export async function readJsonResponse<T = unknown>(
  response: Response,
): Promise<T | null> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function readJsonResponseOrThrow<T = unknown>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const data = await readJsonResponse<T>(response);
  if (data === null) throw new Error(fallbackMessage);
  return data;
}

function asResponseRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function getErrorMessageCandidates(value: unknown): unknown[] {
  const data = asResponseRecord(value);
  if (!data) return [];
  const error = asResponseRecord(data.error);
  return [error?.message, data.error, data.message, data.details];
}

function findNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

export async function getResponseErrorMessage(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  const data = await readJsonResponse(response);
  return findNonEmptyString(getErrorMessageCandidates(data)) || fallbackMessage;
}
