import { HostedProxyBlockedError } from "../errors";
import {
  getOutboundPolicyProfile,
  type OutboundPolicyProfile,
} from "./deployment";
export {
  getProviderApiKey,
  getProviderModelsUrl,
  normalizeProviderBaseUrl,
} from "./providerUrl";
export type { ProviderRuntimeConfig } from "./providerUrl";

export type OutboundContext =
  | "provider"
  | "search"
  | "rag"
  | "plugin"
  | "pluginManifest"
  | "mcp"
  | "docs"
  | "voice"
  | "agent"
  | "metadata"
  | "sharedStore";

export interface SafeUrlPolicy {
  context: OutboundContext;
  allowedProtocols?: Array<"https:" | "http:">;
  allowLocalhost?: boolean;
  allowPrivateNetwork?: boolean;
  allowHttp?: boolean;
  allowLocalHttp?: boolean;
  allowedHosts?: string[];
  maxRedirects?: number;
  profile?: OutboundPolicyProfile;
  hostedProxyBlocked?: boolean;
}

export interface ValidatedOutboundRequest {
  url: URL;
  policy: SafeUrlPolicy;
  hostname: string;
  protocol: string;
}

const IPV4_PART_COUNT = 4;
const IPV4_OCTET_MIN = 0;
const IPV4_OCTET_MAX = 255;
const PRIVATE_IPV4_FIRST_OCTETS = new Set([10, 127]);
const PRIVATE_IPV4_SECOND_OCTET_RANGES = [
  { first: 169, minSecond: 254, maxSecond: 254 },
  { first: 172, minSecond: 16, maxSecond: 31 },
  { first: 192, minSecond: 168, maxSecond: 168 },
  { first: 100, minSecond: 64, maxSecond: 127 },
] as const;
const PRIVATE_IP_EXACT_MATCHES = new Set([
  "::1",
  "0:0:0:0:0:0:0:1",
  "0.0.0.0",
  "::",
]);
const PRIVATE_IPV6_PREFIXES = ["fc", "fd", "fe80:"];
const LOCAL_PROXY_CONTEXTS = new Set<OutboundContext>([
  "provider",
  "rag",
  "search",
]);
const ALLOWED_HOSTS_BY_CONTEXT: Partial<Record<OutboundContext, string[]>> = {
  docs: [
    "api.cloud.llamaindex.ai",
    "mineru.net",
    "oss-mineru.openxlab.org.cn",
    "mineru.oss-cn-shanghai.aliyuncs.com",
    "cdn-mineru.openxlab.org.cn",
  ],
  voice: ["api.elevenlabs.io", "api.xiaomimimo.com"],
  agent: ["registry.npmmirror.com"],
  metadata: ["basellm.github.io"],
};

export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    for (const key of parsed.searchParams.keys()) {
      if (/key|token|secret|auth|password/i.test(key)) {
        parsed.searchParams.set(key, "[redacted]");
      }
    }
    return parsed.toString();
  } catch {
    return "[invalid-url]";
  }
}

export function isLocalhostName(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === "localhost" || host.endsWith(".localhost");
}

function parseIpv4Parts(value: string): number[] | null {
  const parts = value.split(".").map((part) => Number(part));
  if (parts.length !== IPV4_PART_COUNT) return null;
  const invalid = parts.some(
    (part) =>
      !Number.isInteger(part) || part < IPV4_OCTET_MIN || part > IPV4_OCTET_MAX,
  );
  return invalid ? null : parts;
}

function matchesPrivateIpv4Range(first: number, second: number): boolean {
  if (PRIVATE_IPV4_FIRST_OCTETS.has(first)) return true;
  return PRIVATE_IPV4_SECOND_OCTET_RANGES.some(
    (range) =>
      range.first === first &&
      second >= range.minSecond &&
      second <= range.maxSecond,
  );
}

function isPrivateIpv4Address(value: string): boolean {
  if (value === "0.0.0.0") return true;
  const parts = parseIpv4Parts(value);
  return Boolean(parts && matchesPrivateIpv4Range(parts[0], parts[1]));
}

export function isPrivateIpAddress(address: string): boolean {
  const value = address.toLowerCase();
  if (PRIVATE_IP_EXACT_MATCHES.has(value)) return true;

  if (value.includes(":")) {
    const ipv4MappedMatch = value.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (ipv4MappedMatch) return isPrivateIpv4Address(ipv4MappedMatch[1]);
    return PRIVATE_IPV6_PREFIXES.some((prefix) => value.startsWith(prefix));
  }
  return isPrivateIpv4Address(value);
}

function createLocalProxyPolicy(
  context: OutboundContext,
  profile: OutboundPolicyProfile,
): SafeUrlPolicy {
  const allowed = profile.allowLocalNetworkProxy;
  return {
    context,
    allowedProtocols: allowed ? ["https:", "http:"] : ["https:"],
    allowLocalhost: allowed,
    allowPrivateNetwork: allowed,
    allowLocalHttp: allowed,
    hostedProxyBlocked: profile.mode === "hosted" && !allowed,
    profile,
  };
}

function createMcpPolicy(profile: OutboundPolicyProfile): SafeUrlPolicy {
  const allowed = profile.allowLocalNetworkProxy;
  return {
    context: "mcp",
    allowedProtocols: ["https:"],
    allowLocalhost: allowed,
    allowPrivateNetwork: allowed,
    hostedProxyBlocked: profile.mode === "hosted" && !allowed,
    profile,
  };
}

function createRestrictedPolicy(
  context: OutboundContext,
  profile: OutboundPolicyProfile,
): SafeUrlPolicy {
  const allowedHosts = ALLOWED_HOSTS_BY_CONTEXT[context];
  if (allowedHosts) {
    return { context, allowedProtocols: ["https:"], allowedHosts, profile };
  }
  return {
    context,
    allowedProtocols: ["https:"],
    allowLocalhost: false,
    allowPrivateNetwork: false,
    profile,
  };
}

export function getSafeUrlPolicy(context: OutboundContext): SafeUrlPolicy {
  const profile = getOutboundPolicyProfile();
  if (LOCAL_PROXY_CONTEXTS.has(context)) {
    return createLocalProxyPolicy(context, profile);
  }
  return context === "mcp"
    ? createMcpPolicy(profile)
    : createRestrictedPolicy(context, profile);
}

function createOutboundPolicyError(
  policy: SafeUrlPolicy,
  message: string,
): Error {
  return policy.hostedProxyBlocked
    ? new HostedProxyBlockedError(message)
    : new Error(message);
}

function parseOutboundUrl(value: string | URL, context: OutboundContext): URL {
  try {
    return value instanceof URL ? value : new URL(value);
  } catch {
    throw new Error(`Invalid outbound URL for ${context}`);
  }
}

function assertProtocolAllowed(url: URL, policy: SafeUrlPolicy): void {
  const allowedProtocols = policy.allowedProtocols || ["https:"];
  if (allowedProtocols.includes(url.protocol as "https:" | "http:")) return;
  throw createOutboundPolicyError(
    policy,
    `Protocol ${url.protocol} is not allowed`,
  );
}

function assertHostAllowed(hostname: string, policy: SafeUrlPolicy): void {
  if (!policy.allowedHosts?.length) return;
  const isAllowed = policy.allowedHosts.some((host) => {
    const expected = host.toLowerCase();
    return hostname === expected || hostname.endsWith(`.${expected}`);
  });
  if (!isAllowed) {
    throw new Error(`Host ${hostname} is not trusted for ${policy.context}`);
  }
}

interface HostClassification {
  isLocalhost: boolean;
  isPrivateLiteral: boolean;
}

function assertNetworkTargetAllowed(
  target: HostClassification,
  policy: SafeUrlPolicy,
): void {
  if (target.isLocalhost && !policy.allowLocalhost) {
    throw createOutboundPolicyError(
      policy,
      "Localhost outbound requests are blocked",
    );
  }
  if (target.isPrivateLiteral && !policy.allowPrivateNetwork) {
    throw createOutboundPolicyError(
      policy,
      "Private network outbound requests are blocked",
    );
  }
}

function assertHttpAllowed(
  url: URL,
  target: HostClassification,
  policy: SafeUrlPolicy,
): void {
  if (url.protocol !== "http:") return;
  const isLocalHttp = target.isLocalhost || target.isPrivateLiteral;
  if (policy.allowHttp || (policy.allowLocalHttp && isLocalHttp)) return;
  throw createOutboundPolicyError(
    policy,
    "Plain HTTP outbound requests are blocked",
  );
}

export function validateOutboundUrl(
  value: string | URL,
  policy: SafeUrlPolicy,
): ValidatedOutboundRequest {
  const url = parseOutboundUrl(value, policy.context);
  if (url.username || url.password) {
    throw new Error("Outbound URLs must not include embedded credentials");
  }
  assertProtocolAllowed(url, policy);
  const hostname = url.hostname.toLowerCase();
  assertHostAllowed(hostname, policy);
  const target = {
    isLocalhost: isLocalhostName(hostname),
    isPrivateLiteral: isPrivateIpAddress(hostname),
  };
  assertNetworkTargetAllowed(target, policy);
  assertHttpAllowed(url, target, policy);
  return {
    url,
    policy,
    hostname,
    protocol: url.protocol,
  };
}
