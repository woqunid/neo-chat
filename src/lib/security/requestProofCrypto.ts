interface RequestProofSessionPayload {
  v: 1;
  k: string;
  exp: number;
}

declare global {
  var __neoChatRequestProofSigningKey:
    | {
        material: string;
        promise: Promise<CryptoKey>;
      }
    | undefined;
}

const CLIENT_KEY_BYTES = 32;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is required for API request proof");
  }
  return globalThis.crypto;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const base64 = padded.padEnd(
    padded.length + ((4 - (padded.length % 4)) % 4),
    "=",
  );
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function getSigningMaterial(): string {
  return process.env.BYOK_PRIVATE_KEY_PEM?.trim().replace(/\\n/g, "\n") || "";
}

export function isRequestProofConfigured(): boolean {
  return Boolean(getSigningMaterial());
}

async function importServerSigningKey(material: string): Promise<CryptoKey> {
  const crypto = getCrypto();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(`neo-api-proof:v1:${material}`),
  );
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function getServerSigningKey(): Promise<CryptoKey | null> {
  const material = getSigningMaterial();
  if (!material) return null;
  if (globalThis.__neoChatRequestProofSigningKey?.material !== material) {
    globalThis.__neoChatRequestProofSigningKey = {
      material,
      promise: importServerSigningKey(material),
    };
  }
  return globalThis.__neoChatRequestProofSigningKey.promise;
}

async function importClientProofKey(clientKey: string): Promise<CryptoKey> {
  return getCrypto().subtle.importKey(
    "raw",
    toArrayBuffer(base64UrlToBytes(clientKey)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signString(key: CryptoKey, value: string): Promise<string> {
  const signature = await getCrypto().subtle.sign(
    "HMAC",
    key,
    encoder.encode(value),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifyString(
  key: CryptoKey,
  value: string,
  signature: string,
): Promise<boolean> {
  try {
    return getCrypto().subtle.verify(
      "HMAC",
      key,
      toArrayBuffer(base64UrlToBytes(signature)),
      encoder.encode(value),
    );
  } catch {
    return false;
  }
}

export function createRequestProofClientKey(): string {
  const bytes = new Uint8Array(CLIENT_KEY_BYTES);
  getCrypto().getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function signRequestProofSession(
  payload: RequestProofSessionPayload,
): Promise<string> {
  const key = await getServerSigningKey();
  if (!key) return "";
  const encoded = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${encoded}.${await signString(key, encoded)}`;
}

function parseSessionPayload(
  encoded: string,
): RequestProofSessionPayload | null {
  try {
    const payload = JSON.parse(
      decoder.decode(base64UrlToBytes(encoded)),
    ) as Partial<RequestProofSessionPayload>;
    if (payload.v !== 1 || !payload.k || typeof payload.exp !== "number") {
      return null;
    }
    return payload as RequestProofSessionPayload;
  } catch {
    return null;
  }
}

export async function verifyRequestProofSession(
  cookieValue: string | undefined,
  now: number,
): Promise<RequestProofSessionPayload | null> {
  const [payloadValue, signature] = (cookieValue || "").trim().split(".");
  if (!payloadValue || !signature) return null;
  const key = await getServerSigningKey();
  if (!key || !(await verifyString(key, payloadValue, signature))) return null;
  const payload = parseSessionPayload(payloadValue);
  return payload && payload.exp > now ? payload : null;
}

export async function signRequestProofInput(
  clientKey: string,
  input: string,
): Promise<string> {
  return signString(await importClientProofKey(clientKey), input);
}

export async function verifyRequestProofInput(
  clientKey: string,
  input: string,
  signature: string,
): Promise<boolean> {
  return verifyString(await importClientProofKey(clientKey), input, signature);
}

export async function hashRequestProofIdentity(clientKey: string) {
  const digest = await getCrypto().subtle.digest(
    "SHA-256",
    encoder.encode(`neo-api-rate-limit:v1:${clientKey}`),
  );
  return `proof:${bytesToBase64Url(new Uint8Array(digest))}`;
}

export function clearRequestProofSigningKey(): void {
  globalThis.__neoChatRequestProofSigningKey = undefined;
}
