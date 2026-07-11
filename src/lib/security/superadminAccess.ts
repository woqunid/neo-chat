export const SUPERADMIN_PASSWORD_ENV = "SUPERADMIN_PASSWORD";
export const SUPERADMIN_SESSION_COOKIE = "neo_superadmin_session";

const encoder = new TextEncoder();

export function getSuperadminPassword(): string {
  return process.env[SUPERADMIN_PASSWORD_ENV]?.trim() || "";
}

export function isSuperadminPasswordEnabled(): boolean {
  return Boolean(getSuperadminPassword());
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function isValidSuperadminPassword(
  candidate: string,
): Promise<boolean> {
  const password = getSuperadminPassword();
  if (!password) return false;
  return timingSafeEqual(
    await digest(candidate.trim()),
    await digest(password),
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function getSigningKey(): Promise<CryptoKey | null> {
  const password = getSuperadminPassword();
  if (!password) return null;
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`superadmin:${password}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSuperadminSession(): Promise<string> {
  const key = await getSigningKey();
  if (!key) return "";
  const payload = "v1";
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function isValidSuperadminSession(
  value: string | undefined,
): Promise<boolean> {
  const key = await getSigningKey();
  const [payload, signature] = value?.split(".") || [];
  if (!key || payload !== "v1" || !signature) return false;
  return createSuperadminSession().then((expected) => expected === value);
}
