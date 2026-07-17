import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { RequestOptions } from "@modelcontextprotocol/sdk/shared/protocol.js";
import {
  ListRootsRequestSchema,
  LoggingMessageNotificationSchema,
  ProgressNotificationSchema,
  PromptListChangedNotificationSchema,
  ResourceListChangedNotificationSchema,
  ResourceUpdatedNotificationSchema,
  ToolListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createSafeMcpFetch } from "./safeMcpFetch";
import type {
  McpAuthConfig,
  McpClientRequestOptions,
  McpDiscoveryResult,
  McpPrompt,
  McpResource,
  McpResourceTemplate,
  McpTool,
} from "./types";
import { getSafeUrlPolicy, validateOutboundUrl } from "../security/urlPolicy";

export { createSafeMcpFetch } from "./safeMcpFetch";
export type {
  CreateSafeMcpFetchOptions,
  McpAuthConfig,
  McpClientRequestOptions,
  McpDiscoveryResult,
  McpPrompt,
  McpResource,
  McpResourceTemplate,
  McpTool,
} from "./types";

const MCP_CLIENT_INFO = { name: "neo-chat", version: "1.0.0" };
const MCP_REQUEST_TIMEOUT_MS = 30_000;
const MCP_DISCOVERY_ITEM_LIMIT = 200;
const MCP_DISCOVERY_PAGE_LIMIT = 20;
const MCP_SESSION_IDLE_TIMEOUT_MS = 90_000;

interface McpConnection {
  client: Client;
  transport: StreamableHTTPClientTransport;
}

interface ManagedMcpConnection extends McpConnection {
  fingerprint: string;
  closeTimer?: ReturnType<typeof setTimeout>;
}

export interface McpSessionEvent {
  type:
    | "tools_list_changed"
    | "resources_list_changed"
    | "resource_updated"
    | "prompts_list_changed"
    | "progress"
    | "logging";
  payload?: unknown;
  timestamp: number;
}

declare global {
  var __neoChatMcpSessions: Map<string, ManagedMcpConnection> | undefined;
  var __neoChatMcpSessionRequests:
    Map<string, Promise<ManagedMcpConnection>> | undefined;
  var __neoChatMcpSessionEvents: Map<string, McpSessionEvent[]> | undefined;
}

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

function normalizeStaticHeaders(
  staticHeaders?: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(staticHeaders || {})
      .map(([name, value]) => [name.trim(), value.trim()])
      .filter(([name, value]) => Boolean(name && value)),
  );
}

function getAuthHeader(
  authConfig?: McpAuthConfig,
): readonly [string, string] | null {
  if (!authConfig) return null;
  const authValue = authConfig.value?.trim();
  if (!authValue || authConfig.addTo === "query") return null;

  if (authConfig.type === "bearer" || authConfig.type === "oauth2") {
    return ["Authorization", `Bearer ${authValue}`];
  }
  if (authConfig.type === "apiKey") {
    return [authConfig.key || "X-API-Key", authValue];
  }
  return null;
}

function buildRequestInit(
  authConfig?: McpAuthConfig,
  staticHeaders?: Record<string, string>,
): RequestInit {
  const headers = normalizeStaticHeaders(staticHeaders);
  const authHeader = getAuthHeader(authConfig);
  if (authHeader) headers[authHeader[0]] = authHeader[1];
  return { headers };
}

const safeMcpFetch = createSafeMcpFetch();
const validateMcpFetchTarget: typeof fetch = (input, init) => {
  const target =
    typeof input === "string" || input instanceof URL ? input : input.url;
  validateOutboundUrl(target, getSafeUrlPolicy("mcp"));
  return safeMcpFetch(input, init);
};

function getSessionStore(): Map<string, ManagedMcpConnection> {
  if (!globalThis.__neoChatMcpSessions) {
    globalThis.__neoChatMcpSessions = new Map();
  }
  return globalThis.__neoChatMcpSessions;
}

function getSessionRequestStore(): Map<string, Promise<ManagedMcpConnection>> {
  if (!globalThis.__neoChatMcpSessionRequests) {
    globalThis.__neoChatMcpSessionRequests = new Map();
  }
  return globalThis.__neoChatMcpSessionRequests;
}

function getSessionEventStore(): Map<string, McpSessionEvent[]> {
  if (!globalThis.__neoChatMcpSessionEvents) {
    globalThis.__neoChatMcpSessionEvents = new Map();
  }
  return globalThis.__neoChatMcpSessionEvents;
}

function recordSessionEvent(
  sessionKey: string,
  event: Omit<McpSessionEvent, "timestamp">,
): void {
  const current = getSessionEventStore().get(sessionKey) || [];
  getSessionEventStore().set(sessionKey, [
    ...current.slice(-49),
    { ...event, timestamp: Date.now() },
  ]);
}

export function drainMcpSessionEvents(sessionKey: string): McpSessionEvent[] {
  const events = getSessionEventStore().get(sessionKey) || [];
  getSessionEventStore().delete(sessionKey);
  return events;
}

function connectionFingerprint(options: McpClientRequestOptions): string {
  const input = JSON.stringify({
    serverUrl: options.serverUrl,
    authConfig: options.authConfig,
    staticHeaders: options.staticHeaders,
    roots: options.roots,
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function createMcpClient(options: McpClientRequestOptions): Client {
  const client = new Client(MCP_CLIENT_INFO, {
    capabilities: options.roots ? { roots: { listChanged: false } } : {},
  });
  if (options.roots) {
    client.setRequestHandler(ListRootsRequestSchema, async () => ({
      roots: options.roots || [],
    }));
  }
  if (options.sessionKey) {
    const record = (type: McpSessionEvent["type"], payload?: unknown) =>
      recordSessionEvent(options.sessionKey as string, { type, payload });
    client.setNotificationHandler(ToolListChangedNotificationSchema, (event) =>
      record("tools_list_changed", event.params),
    );
    client.setNotificationHandler(
      ResourceListChangedNotificationSchema,
      (event) => record("resources_list_changed", event.params),
    );
    client.setNotificationHandler(ResourceUpdatedNotificationSchema, (event) =>
      record("resource_updated", event.params),
    );
    client.setNotificationHandler(
      PromptListChangedNotificationSchema,
      (event) => record("prompts_list_changed", event.params),
    );
    client.setNotificationHandler(ProgressNotificationSchema, (event) =>
      record("progress", event.params),
    );
    client.setNotificationHandler(LoggingMessageNotificationSchema, (event) =>
      record("logging", event.params),
    );
  }
  return client;
}

async function createConnection(
  options: McpClientRequestOptions,
): Promise<McpConnection> {
  const transport = new StreamableHTTPClientTransport(
    resolveMcpServerUrl(options.serverUrl, options.authConfig),
    {
      requestInit: buildRequestInit(options.authConfig, options.staticHeaders),
      fetch: validateMcpFetchTarget,
    },
  );
  const client = createMcpClient(options);
  try {
    await client.connect(transport, {
      timeout: options.timeoutMs || MCP_REQUEST_TIMEOUT_MS,
      signal: options.signal,
    });
    return { client, transport };
  } catch (error) {
    await transport.close().catch(() => undefined);
    throw error;
  }
}

async function closeManagedConnection(
  sessionKey: string,
  connection: ManagedMcpConnection,
): Promise<void> {
  if (getSessionStore().get(sessionKey) !== connection) return;
  getSessionStore().delete(sessionKey);
  await connection.transport.terminateSession().catch(() => undefined);
  await connection.transport.close().catch(() => undefined);
}

function scheduleManagedClose(
  sessionKey: string,
  connection: ManagedMcpConnection,
): void {
  if (connection.closeTimer) clearTimeout(connection.closeTimer);
  connection.closeTimer = setTimeout(() => {
    void closeManagedConnection(sessionKey, connection);
  }, MCP_SESSION_IDLE_TIMEOUT_MS);
}

async function getManagedConnection(
  options: McpClientRequestOptions,
): Promise<ManagedMcpConnection> {
  const sessionKey = options.sessionKey as string;
  const fingerprint = connectionFingerprint(options);
  const current = getSessionStore().get(sessionKey);
  if (current?.fingerprint === fingerprint) {
    if (current.closeTimer) clearTimeout(current.closeTimer);
    return current;
  }
  if (current) await closeManagedConnection(sessionKey, current);

  const pending = getSessionRequestStore().get(sessionKey);
  if (pending) return pending;
  const request = createConnection(options).then((connection) => {
    const managed = { ...connection, fingerprint };
    getSessionStore().set(sessionKey, managed);
    return managed;
  });
  getSessionRequestStore().set(sessionKey, request);
  try {
    return await request;
  } finally {
    if (getSessionRequestStore().get(sessionKey) === request) {
      getSessionRequestStore().delete(sessionKey);
    }
  }
}

async function withMcpClient<T>(
  options: McpClientRequestOptions,
  operation: (client: Client, requestOptions: RequestOptions) => Promise<T>,
): Promise<T> {
  const requestOptions: RequestOptions = {
    timeout: options.timeoutMs || MCP_REQUEST_TIMEOUT_MS,
    signal: options.signal,
  };
  if (options.sessionKey) {
    const connection = await getManagedConnection(options);
    try {
      return await operation(connection.client, requestOptions);
    } catch (error) {
      await closeManagedConnection(options.sessionKey, connection);
      throw error;
    } finally {
      if (getSessionStore().get(options.sessionKey) === connection) {
        scheduleManagedClose(options.sessionKey, connection);
      }
    }
  }

  const { client, transport } = await createConnection(options);
  try {
    return await operation(client, requestOptions);
  } finally {
    await transport.close().catch(() => undefined);
  }
}

async function collectPages<T>(
  request: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MCP_DISCOVERY_PAGE_LIMIT; page += 1) {
    const result = await request(cursor);
    items.push(
      ...result.items.slice(0, MCP_DISCOVERY_ITEM_LIMIT - items.length),
    );
    if (!result.nextCursor || items.length >= MCP_DISCOVERY_ITEM_LIMIT) break;
    cursor = result.nextCursor;
  }
  return items;
}

function summarizeCapabilities(
  value: ReturnType<Client["getServerCapabilities"]>,
): McpDiscoveryResult["capabilities"] {
  const capabilities = value || {};
  return {
    ...(capabilities.tools ? { tools: true } : {}),
    ...(capabilities.resources
      ? {
          resources: true,
          ...(capabilities.resources.subscribe
            ? { resourceSubscriptions: true }
            : {}),
          ...(capabilities.resources.listChanged
            ? { resourceListChanged: true }
            : {}),
        }
      : {}),
    ...(capabilities.prompts
      ? {
          prompts: true,
          ...(capabilities.prompts.listChanged
            ? { promptListChanged: true }
            : {}),
        }
      : {}),
    ...(capabilities.logging ? { logging: true } : {}),
  };
}

async function discoverWithClient(
  client: Client,
  requestOptions: RequestOptions,
): Promise<McpDiscoveryResult> {
  const capabilities = client.getServerCapabilities();
  const tools = capabilities?.tools
    ? await collectPages<McpTool>(async (cursor) => {
        const result = await client.listTools(
          cursor ? { cursor } : undefined,
          requestOptions,
        );
        return {
          items: result.tools as McpTool[],
          nextCursor: result.nextCursor,
        };
      })
    : [];
  const resources = capabilities?.resources
    ? await collectPages<McpResource>(async (cursor) => {
        const result = await client.listResources(
          cursor ? { cursor } : undefined,
          requestOptions,
        );
        return {
          items: result.resources as McpResource[],
          nextCursor: result.nextCursor,
        };
      })
    : [];
  const resourceTemplates = capabilities?.resources
    ? await collectPages<McpResourceTemplate>(async (cursor) => {
        const result = await client.listResourceTemplates(
          cursor ? { cursor } : undefined,
          requestOptions,
        );
        return {
          items: result.resourceTemplates as McpResourceTemplate[],
          nextCursor: result.nextCursor,
        };
      })
    : [];
  const prompts = capabilities?.prompts
    ? await collectPages<McpPrompt>(async (cursor) => {
        const result = await client.listPrompts(
          cursor ? { cursor } : undefined,
          requestOptions,
        );
        return {
          items: result.prompts as McpPrompt[],
          nextCursor: result.nextCursor,
        };
      })
    : [];
  return {
    tools,
    resources,
    resourceTemplates,
    prompts,
    capabilities: summarizeCapabilities(capabilities),
  };
}

export async function discoverMcpServer(
  options: McpClientRequestOptions,
): Promise<McpDiscoveryResult> {
  return withMcpClient(options, discoverWithClient);
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

export async function readMcpResource(
  options: McpClientRequestOptions & { uri: string },
): Promise<unknown> {
  return withMcpClient(options, (client, requestOptions) =>
    client.readResource({ uri: options.uri }, requestOptions),
  );
}

export async function subscribeMcpResource(
  options: McpClientRequestOptions & { uri: string },
): Promise<unknown> {
  return withMcpClient(options, (client, requestOptions) =>
    client.subscribeResource({ uri: options.uri }, requestOptions),
  );
}

export async function unsubscribeMcpResource(
  options: McpClientRequestOptions & { uri: string },
): Promise<unknown> {
  return withMcpClient(options, (client, requestOptions) =>
    client.unsubscribeResource({ uri: options.uri }, requestOptions),
  );
}

export async function getMcpPrompt(
  options: McpClientRequestOptions & {
    name: string;
    args?: Record<string, string>;
  },
): Promise<unknown> {
  return withMcpClient(options, (client, requestOptions) =>
    client.getPrompt(
      { name: options.name, arguments: options.args },
      requestOptions,
    ),
  );
}

export async function completeMcpPromptArgument(
  options: McpClientRequestOptions & {
    promptName: string;
    argumentName: string;
    value: string;
  },
): Promise<string[]> {
  return withMcpClient(options, async (client, requestOptions) => {
    const result = await client.complete(
      {
        ref: { type: "ref/prompt", name: options.promptName },
        argument: { name: options.argumentName, value: options.value },
      },
      requestOptions,
    );
    return result.completion.values;
  });
}
