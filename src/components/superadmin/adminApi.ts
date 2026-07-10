export async function requestAdminJson<T>(
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<T> {
  const response = await fetch(path, init);
  if (response.ok) return (await response.json()) as T;

  const data = await response.json().catch(() => null);
  const message = typeof data?.error === "string" ? data.error : fallback;
  throw new Error(message);
}
