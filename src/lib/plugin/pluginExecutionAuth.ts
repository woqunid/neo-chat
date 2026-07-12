import type { Plugin } from "../../types";
import type {
  PluginAuthConfig,
  PluginHttpMethod,
} from "./pluginExecutionTypes";

type PluginAuthType = NonNullable<Plugin["auth"]>["type"];
type AuthTargetLocation = "header" | "query";
type AuthTargetSource = "manifest" | "runtime" | "default";

interface PluginAuthTarget {
  readonly name: string;
  readonly location?: AuthTargetLocation;
  readonly source: AuthTargetSource;
}

interface AuthenticationInput {
  readonly plugin: Plugin;
  readonly authConfig?: PluginAuthConfig;
  readonly authValue?: string;
  readonly method: PluginHttpMethod;
  readonly headers: Readonly<Record<string, string>>;
  readonly url: URL;
  readonly outboundArgs: Readonly<Record<string, unknown>>;
}

export type AuthenticationResult =
  | { readonly error: string }
  | {
      readonly headers: Record<string, string>;
      readonly url: URL;
      readonly outboundArgs: Record<string, unknown>;
    };

const BODY_AUTH_METHODS: readonly PluginHttpMethod[] = ["POST", "PUT", "PATCH"];
const AUTH_HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const AUTH_QUERY_NAME_PATTERN = /^[A-Za-z0-9._~-]{1,120}$/;
const FORBIDDEN_AUTH_HEADER_NAMES: ReadonlySet<string> = new Set([
  "accept-encoding",
  "connection",
  "content-length",
  "cookie",
  "host",
  "proxy-authorization",
  "sec-fetch-dest",
  "sec-fetch-mode",
  "sec-fetch-site",
  "sec-fetch-user",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function getAuthType(
  plugin: Plugin,
  authConfig: PluginAuthConfig | undefined,
): PluginAuthConfig["type"] | PluginAuthType | undefined {
  if (plugin.auth?.type && plugin.auth.type !== "none") {
    return plugin.auth.type;
  }
  return authConfig?.type;
}

function getManifestAuthTarget(plugin: Plugin): PluginAuthTarget | null {
  const manifestName = plugin.auth?.name?.trim();
  return manifestName
    ? {
        name: manifestName,
        location: plugin.auth?.in,
        source: "manifest",
      }
    : null;
}

function getRuntimeAuthTarget(
  authConfig: PluginAuthConfig | undefined,
): PluginAuthTarget | null {
  const runtimeName = authConfig?.key?.trim();
  return runtimeName
    ? {
        name: runtimeName,
        location: authConfig?.addTo,
        source: "runtime",
      }
    : null;
}

function getDefaultAuthTarget(
  plugin: Plugin,
  authConfig: PluginAuthConfig | undefined,
): PluginAuthTarget {
  const usesApiKey =
    plugin.auth?.type === "apiKey" || authConfig?.type === "apiKey";
  return {
    name: usesApiKey ? "X-API-Key" : "Authorization",
    location: plugin.auth?.in || authConfig?.addTo,
    source: "default",
  };
}

function getPluginAuthTarget(
  plugin: Plugin,
  authConfig: PluginAuthConfig | undefined,
): PluginAuthTarget {
  return (
    getManifestAuthTarget(plugin) ??
    getRuntimeAuthTarget(authConfig) ??
    getDefaultAuthTarget(plugin, authConfig)
  );
}

function isForbiddenAuthHeader(target: PluginAuthTarget): boolean {
  const normalized = target.name.toLowerCase();
  return (
    FORBIDDEN_AUTH_HEADER_NAMES.has(normalized) ||
    normalized.startsWith("sec-") ||
    normalized.startsWith("proxy-") ||
    (target.source !== "manifest" && normalized === "authorization")
  );
}

function getPluginAuthTargetError(target: PluginAuthTarget): string | null {
  if (!target.name) return "Plugin authentication parameter name is required";

  if (target.location === "header") {
    if (!AUTH_HEADER_NAME_PATTERN.test(target.name)) {
      return "Plugin authentication header name is not allowed";
    }
    if (isForbiddenAuthHeader(target)) {
      return "Plugin authentication header name is not allowed";
    }
  }

  if (
    target.location === "query" &&
    !AUTH_QUERY_NAME_PATTERN.test(target.name)
  ) {
    return "Plugin authentication query parameter name is not allowed";
  }
  return null;
}

function addApiKeyAuthentication(
  input: AuthenticationInput,
  target: PluginAuthTarget,
): AuthenticationResult {
  const targetError = getPluginAuthTargetError(target);
  if (targetError) return { error: targetError };

  const headers = { ...input.headers };
  const url = new URL(input.url);
  const outboundArgs = { ...input.outboundArgs };
  if (target.location === "header") {
    headers[target.name] = input.authValue as string;
  } else if (target.location === "query") {
    url.searchParams.append(target.name, input.authValue as string);
  } else if (BODY_AUTH_METHODS.includes(input.method)) {
    outboundArgs[target.name] = input.authValue;
  } else {
    headers[target.name] = input.authValue as string;
  }
  return { headers, url, outboundArgs };
}

export function preparePluginAuthentication(
  input: AuthenticationInput,
): AuthenticationResult {
  const unchanged = {
    headers: { ...input.headers },
    url: new URL(input.url),
    outboundArgs: { ...input.outboundArgs },
  };
  if (!input.authValue) return unchanged;

  const authType = getAuthType(input.plugin, input.authConfig);
  if (authType === "bearer" || authType === "oauth2") {
    return {
      ...unchanged,
      headers: {
        ...unchanged.headers,
        Authorization: `Bearer ${input.authValue}`,
      },
    };
  }
  if (authType !== "apiKey" && input.authConfig?.type !== "apiKey") {
    return unchanged;
  }
  const target = getPluginAuthTarget(input.plugin, input.authConfig);
  return addApiKeyAuthentication(input, target);
}
