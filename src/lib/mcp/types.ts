export interface McpAuthConfig {
  type?: "bearer" | "apiKey" | "none" | "oauth2";
  value?: string;
  key?: string;
  addTo?: "header" | "query";
}

export interface McpClientRequestOptions {
  serverUrl: string;
  authConfig?: McpAuthConfig;
  staticHeaders?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface CreateSafeMcpFetchOptions {
  maxResponseBytes?: number;
  timeoutMs?: number;
}

export interface McpTool {
  name?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  [key: string]: unknown;
}
