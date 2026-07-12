export type ApiRouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRateLimitPolicy {
  routeFamily: string;
  windowMs: number;
  maxRequests: number;
}

interface ApiRoutePolicy {
  pattern: RegExp;
  requestProofMethods?: readonly ApiRouteMethod[];
  rateLimitMethods?: readonly ApiRouteMethod[];
  rateLimit?: ApiRateLimitPolicy;
}

const ONE_MINUTE_MS = 60_000;
const RATE_LIMITS = {
  access: 300,
  agents: 30,
  chat: 60,
  docParse: 10,
  grokSearch: 30,
  mcpServers: 30,
  mutating: 120,
  pluginExecute: 30,
  pluginInstall: 20,
  pluginList: 15,
  providerModels: 30,
  rag: 30,
  superadmin: 30,
  voice: 20,
} as const;
const ALL_METHODS: readonly ApiRouteMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
];
const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;
const GET_METHOD = ["GET"] as const;
const POST_METHOD = ["POST"] as const;
const PROVIDER_MODEL_METHODS = ["GET", "POST"] as const;

export const MUTATING_API_METHODS = new Set<ApiRouteMethod>(MUTATING_METHODS);
export const DEFAULT_MUTATING_API_RATE_LIMIT: ApiRateLimitPolicy = {
  routeFamily: "/api/mutating",
  windowMs: ONE_MINUTE_MS,
  maxRequests: RATE_LIMITS.mutating,
};

function rateLimit(routeFamily: string, maxRequests: number) {
  return { routeFamily, windowMs: ONE_MINUTE_MS, maxRequests };
}

const API_ROUTE_POLICIES: readonly ApiRoutePolicy[] = [
  {
    pattern: /^\/api\/access\/verify$/,
    rateLimitMethods: POST_METHOD,
    rateLimit: rateLimit("/api/access/verify", RATE_LIMITS.access),
  },
  {
    pattern: /^\/api\/superadmin(?:\/|$)/,
    rateLimitMethods: MUTATING_METHODS,
    rateLimit: rateLimit("/api/superadmin", RATE_LIMITS.superadmin),
  },
  {
    pattern: /^\/api\/chat(?:\/|$)/,
    requestProofMethods: ALL_METHODS,
    rateLimitMethods: MUTATING_METHODS,
    rateLimit: rateLimit("/api/chat", RATE_LIMITS.chat),
  },
  {
    pattern: /^\/api\/grok-search$/,
    requestProofMethods: POST_METHOD,
    rateLimitMethods: POST_METHOD,
    rateLimit: rateLimit("/api/grok-search", RATE_LIMITS.grokSearch),
  },
  {
    pattern: /^\/api\/rag(?:\/|$)/,
    requestProofMethods: ALL_METHODS,
    rateLimitMethods: MUTATING_METHODS,
    rateLimit: rateLimit("/api/rag", RATE_LIMITS.rag),
  },
  {
    pattern: /^\/api\/voice(?:\/|$)/,
    requestProofMethods: ALL_METHODS,
    rateLimitMethods: MUTATING_METHODS,
    rateLimit: rateLimit("/api/voice", RATE_LIMITS.voice),
  },
  {
    pattern: /^\/api\/doc-parse(?:\/|$)/,
    requestProofMethods: ALL_METHODS,
    rateLimitMethods: MUTATING_METHODS,
    rateLimit: rateLimit("/api/doc-parse", RATE_LIMITS.docParse),
  },
  {
    pattern: /^\/api\/plugins\/execute$/,
    requestProofMethods: POST_METHOD,
    rateLimitMethods: POST_METHOD,
    rateLimit: rateLimit("/api/plugins/execute", RATE_LIMITS.pluginExecute),
  },
  {
    pattern: /^\/api\/plugins\/install$/,
    requestProofMethods: POST_METHOD,
    rateLimitMethods: POST_METHOD,
    rateLimit: rateLimit("/api/plugins/install", RATE_LIMITS.pluginInstall),
  },
  {
    pattern: /^\/api\/plugins\/list$/,
    requestProofMethods: GET_METHOD,
    rateLimitMethods: GET_METHOD,
    rateLimit: rateLimit("/api/plugins/list", RATE_LIMITS.pluginList),
  },
  {
    pattern: /^\/api\/providers\/models$/,
    requestProofMethods: PROVIDER_MODEL_METHODS,
    rateLimitMethods: GET_METHOD,
    rateLimit: rateLimit("/api/providers/models", RATE_LIMITS.providerModels),
  },
  {
    pattern: /^\/api\/mcp\/servers$/,
    requestProofMethods: GET_METHOD,
    rateLimitMethods: GET_METHOD,
    rateLimit: rateLimit("/api/mcp/servers", RATE_LIMITS.mcpServers),
  },
  {
    pattern: /^\/api\/agents(?:\/|$)/,
    requestProofMethods: GET_METHOD,
    rateLimitMethods: GET_METHOD,
    rateLimit: rateLimit("/api/agents", RATE_LIMITS.agents),
  },
];

function normalizeMethod(method: string): ApiRouteMethod | null {
  const normalized = method.toUpperCase();
  return ALL_METHODS.includes(normalized as ApiRouteMethod)
    ? (normalized as ApiRouteMethod)
    : null;
}

function methodMatches(
  methods: readonly ApiRouteMethod[] | undefined,
  method: string,
): boolean {
  const normalized = normalizeMethod(method);
  return Boolean(normalized && methods?.includes(normalized));
}

export function isApiProofProtectedRoute(
  pathname: string,
  method: string,
): boolean {
  return API_ROUTE_POLICIES.some(
    (policy) =>
      policy.pattern.test(pathname) &&
      methodMatches(policy.requestProofMethods, method),
  );
}

export function isMutatingApiRouteMethod(method: string): boolean {
  const normalized = normalizeMethod(method);
  return Boolean(normalized && MUTATING_API_METHODS.has(normalized));
}

export function getApiRateLimitPolicy(
  pathname: string,
  method: string,
): ApiRateLimitPolicy | null {
  const match = API_ROUTE_POLICIES.find(
    (policy) =>
      policy.pattern.test(pathname) &&
      methodMatches(policy.rateLimitMethods, method),
  );
  if (match?.rateLimit) return match.rateLimit;
  return isMutatingApiRouteMethod(method)
    ? DEFAULT_MUTATING_API_RATE_LIMIT
    : null;
}
