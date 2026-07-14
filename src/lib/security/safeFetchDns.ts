import { HostedProxyBlockedError } from "../errors";
import { createAbortError } from "./safeFetchLifecycle";
import {
  isLocalhostName,
  isPrivateIpAddress,
  type SafeUrlPolicy,
} from "./urlPolicy";

type LookupAddress = { address: string; family: number };
type DnsPromisesModule = {
  lookup?(
    hostname: string,
    options: { all: true; verbatim: true },
  ): Promise<LookupAddress[]>;
  resolve4?(hostname: string): Promise<string[]>;
  resolve6?(hostname: string): Promise<string[]>;
};

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[/, "").replace(/\]$/, "");
}

function isIpLiteral(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (normalized.includes(":")) return true;
  const parts = normalized.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => {
      const value = Number(part);
      return /^\d+$/.test(part) && value >= 0 && value <= 255;
    })
  );
}

async function loadNodeDnsModule(): Promise<DnsPromisesModule | null> {
  try {
    const moduleName = "node:dns/promises";
    return (await import(moduleName)) as DnsPromisesModule;
  } catch {
    return null;
  }
}

async function resolveWithWorkerDns(
  dns: DnsPromisesModule,
  hostname: string,
): Promise<LookupAddress[] | null> {
  const lookups: Array<Promise<LookupAddress[]>> = [];
  if (dns.resolve4) {
    lookups.push(
      dns
        .resolve4(hostname)
        .then((values) => values.map((address) => ({ address, family: 4 }))),
    );
  }
  if (dns.resolve6) {
    lookups.push(
      dns
        .resolve6(hostname)
        .then((values) => values.map((address) => ({ address, family: 6 }))),
    );
  }
  if (!lookups.length) return null;
  const results = await Promise.allSettled(lookups);
  const addresses = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
  if (addresses.length) return addresses;
  const rejected = results.find((result) => result.status === "rejected");
  if (rejected?.status === "rejected") throw rejected.reason;
  return null;
}

async function lookupAddresses(
  dns: DnsPromisesModule,
  hostname: string,
): Promise<LookupAddress[] | null> {
  if (!dns.lookup) return resolveWithWorkerDns(dns, hostname);
  try {
    return await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    if (!(error instanceof Error) || !/not implemented/i.test(error.message)) {
      throw error;
    }
    return resolveWithWorkerDns(dns, hostname);
  }
}

async function lookupWithAbort(
  hostname: string,
  signal: AbortSignal,
): Promise<LookupAddress[] | null> {
  if (signal.aborted) throw createAbortError();
  const dns = await loadNodeDnsModule();
  if (!dns) return null;
  if (signal.aborted) throw createAbortError();

  let abortListener: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    abortListener = () => reject(createAbortError());
    signal.addEventListener("abort", abortListener, { once: true });
  });
  try {
    return await Promise.race([lookupAddresses(dns, hostname), abortPromise]);
  } finally {
    if (abortListener) signal.removeEventListener("abort", abortListener);
  }
}

function policyError(policy: SafeUrlPolicy, message: string): Error {
  return policy.hostedProxyBlocked
    ? new HostedProxyBlockedError(message)
    : new Error(message);
}

function assertLiteralAddressAllowed(
  hostname: string,
  policy: SafeUrlPolicy,
): boolean {
  if (isLocalhostName(hostname)) {
    if (!policy.allowLocalhost) {
      throw policyError(policy, "Localhost outbound requests are blocked");
    }
    return true;
  }
  if (!isIpLiteral(hostname)) return false;
  if (isPrivateIpAddress(hostname) && !policy.allowPrivateNetwork) {
    throw policyError(policy, "Private network outbound requests are blocked");
  }
  return true;
}

function assertResolvedAddressesAllowed(
  url: URL,
  addresses: LookupAddress[],
  policy: SafeUrlPolicy,
): void {
  const hasPrivate = addresses.some((entry) =>
    isPrivateIpAddress(entry.address),
  );
  if (hasPrivate && !policy.allowPrivateNetwork) {
    throw policyError(policy, "Private network outbound requests are blocked");
  }
  if (url.protocol !== "http:" || !policy.allowLocalHttp || policy.allowHttp) {
    return;
  }
  const onlyPrivate = addresses.every((entry) =>
    isPrivateIpAddress(entry.address),
  );
  if (!onlyPrivate) {
    throw policyError(
      policy,
      "Plain HTTP is only allowed for local/self-hosted URLs",
    );
  }
}

export async function assertResolvedOutboundUrlAllowed(
  url: URL,
  policy: SafeUrlPolicy,
  signal: AbortSignal,
): Promise<void> {
  const hostname = normalizeHostname(url.hostname);
  if (assertLiteralAddressAllowed(hostname, policy)) return;
  const addresses = await lookupWithAbort(hostname, signal);
  if (addresses) {
    assertResolvedAddressesAllowed(url, addresses, policy);
    return;
  }
  if (policy.requireDnsResolution) {
    throw new HostedProxyBlockedError(
      "DNS validation is unavailable for this outbound request",
    );
  }
  if (url.protocol === "http:" && policy.allowLocalHttp && !policy.allowHttp) {
    throw policyError(
      policy,
      "Plain HTTP is only allowed for local/self-hosted URLs",
    );
  }
}
