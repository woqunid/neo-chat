import "server-only";

import { AuthenticationError } from "../errors";

export const PROVIDER_ADMIN_PASSWORD_ENV = "PROVIDER_ADMIN_PASSWORD";
export const PROVIDER_ADMIN_SESSION_COOKIE = "neo_provider_admin_session";
export const PROVIDER_ADMIN_ERROR_CODES = {
  notConfigured: "PROVIDER_ADMIN_PASSWORD_NOT_CONFIGURED",
  required: "PROVIDER_ADMIN_PASSWORD_REQUIRED",
  invalid: "PROVIDER_ADMIN_PASSWORD_INVALID",
} as const;

const DEFAULT_SESSION_MAX_AGE_SECONDS = 30 * 60;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function getProviderAdminPassword(): string {
  return process.env[PROVIDER_ADMIN_PASSWORD_ENV]?.trim() || "";
}

export function isProviderAdminEnabled(): boolean {
  return Boolean(getProviderAdminPassword());
}

export function getProviderAdminSessionMaxAgeSeconds(): number {
  const value = Number(process.env.PROVIDER_ADMIN_SESSION_MAX_AGE_SECONDS);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_SESSION_MAX_AGE_SECONDS;
  }
  return Math.round(value);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function timingSafeBytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let index = 0; index < a.byteLength; index += 1) {
    diff |= a[index] ^ b[index];
  }
  return diff === 0;
}

async function hash(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return new Uint8Array(digest);
}

async function importSigningKey(): Promise<CryptoKey | null> {
  const password = getProviderAdminPassword();
  if (!password) return null;
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`provider-admin:${password}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function isValidProviderAdminPassword(
  candidate: string,
): Promise<boolean> {
  const password = getProviderAdminPassword();
  if (!password) return false;
  return timingSafeBytesEqual(
    await hash(candidate.trim()),
    await hash(password),
  );
}

export async function createProviderAdminSessionCookieValue(): Promise<string> {
  const key = await importSigningKey();
  if (!key) return "";
  const expiresAt = Date.now() + getProviderAdminSessionMaxAgeSeconds() * 1000;
  const payloadValue = encodeBase64Url(
    encoder.encode(JSON.stringify({ v: 1, expiresAt })),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payloadValue),
  );
  return `${payloadValue}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function isValidProviderAdminSessionCookie(
  cookieValue: string | undefined | null,
): Promise<boolean> {
  const [payloadValue, signatureValue] = (cookieValue || "").trim().split(".");
  if (!payloadValue || !signatureValue) return false;
  const key = await importSigningKey();
  if (!key) return false;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      toArrayBuffer(decodeBase64Url(signatureValue)),
      encoder.encode(payloadValue),
    );
    if (!valid) return false;
    const payload = JSON.parse(decoder.decode(decodeBase64Url(payloadValue)));
    return payload?.v === 1 && Number(payload.expiresAt) > Date.now();
  } catch {
    return false;
  }
}

export async function assertProviderAdminRequest(request: Request) {
  if (!isProviderAdminEnabled()) {
    throw new AuthenticationError("Provider admin password is not configured");
  }
  const cookie = request.headers
    .get("cookie")
    ?.match(new RegExp(`${PROVIDER_ADMIN_SESSION_COOKIE}=([^;]+)`))?.[1];
  if (await isValidProviderAdminSessionCookie(cookie)) return;
  throw new AuthenticationError("Provider admin password is required");
}
