import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { createSafeMcpFetch } from "./safeMcpFetch";
import type { McpAuthConfig, McpClientRequestOptions, McpTool } from "./types";
import { getSafeUrlPolicy, validateOutboundUrl } from "../security/urlPolicy";

export { createSafeMcpFetch } from "./safeMcpFetch";
export type {
  CreateSafeMcpFetchOptions,
  McpAuthConfig,
  McpClientRequestOptions,
  McpTool,
} from "./types";

const MCP_CLIENT_INFO = { name: "neo-chat", version: "1.0.0" };
const MCP_REQUEST_TIMEOUT_MS = 30_000;

function resolveMcpServerUrl(
  serverUrl: string,
  authConfig?: McpAuthConfig,
): URL {
  const { url } = validateOutboundUrl(serverUrl, getSafeUrlPolicy("mcp"));
  const authValue = authConfig?.value?.trim();
  if (
    authValue &&
    authConfig?.type === "apiKey" &&
    authConfig.addTo === "query" &&
    authConfig.key
  ) {
    url.searchParams.set(authConfig.key, authValue);
  }
  return url;
}

function buildRequestInit(
  authConfig?: McpAuthConfig,
  staticHeaders?: Record<string, string>,
): RequestInit {
  const headers = Object.fromEntries(
    Object.entries(staticHeaders || {})
      .map(([name, value]) => [name.trim(), value.trim()])
      .filter(([name, value]) => Boolean(name && value)),
  );
  const authValue = authConfig?.value?.trim();
  if (!authValue || authConfig?.addTo === "query") return { headers };

  if (authConfig?.type === "bearer" || authConfig?.type === "oauth2") {
    headers.Authorization = `Bearer ${authValue}`;
  } else if (authConfig?.type === "apiKey") {
    headers[authConfig.key || "X-API-Key"] = authValue;
  }
  return { headers };
}

const safeMcpFetch = createSafeMcpFetch();
const validateMcpFetchTarget: typeof fetch = (input, init) => {
  const target =
    typeof input === "string" || input instanceof URL ? input : input.url;
  validateOutboundUrl(target, getSafeUrlPolicy("mcp"));
  return safeMcpFetch(input, init);
};

async function withMcpClient<T>(
  options: McpClientRequestOptions,
  operation: (client: Client, requestOptions: RequestOptions) => Promise<T>,
): Promise<T> {
  const transport = new StreamableHTTPClientTransport(
    resolveMcpServerUrl(options.serverUrl, options.authConfig),
    {
      requestInit: buildRequestInit(options.authConfig, options.staticHeaders),
      fetch: validateMcpFetchTarget,
    },
  );
  const client = new Client(MCP_CLIENT_INFO, { capabilities: {} });
  const requestOptions: RequestOptions = {
    timeout: options.timeoutMs || MCP_REQUEST_TIMEOUT_MS,
    signal: options.signal,
  };
  try {
    await client.connect(transport, requestOptions);
    return await operation(client, requestOptions);
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function listMcpTools(
  options: McpClientRequestOptions,
): Promise<McpTool[]> {
  const result = await withMcpClient(options, (client, requestOptions) =>
    client.listTools(undefined, requestOptions),
  );
  return Array.isArray(result.tools) ? (result.tools as McpTool[]) : [];
}

export async function callMcpTool(
  options: McpClientRequestOptions & {
    toolName: string;
    args: Record<string, unknown>;
  },
): Promise<unknown> {
  return withMcpClient(options, (client, requestOptions) =>
    client.callTool(
      { name: options.toolName, arguments: options.args },
      undefined,
      requestOptions,
    ),
  );
}
