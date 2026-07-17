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
  roots?: Array<{ uri: string; name?: string }>;
  sessionKey?: string;
}

export interface CreateSafeMcpFetchOptions {
  maxResponseBytes?: number;
  timeoutMs?: number;
}

export interface McpTool {
  name?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  [key: string]: unknown;
}

export interface McpResource {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
  [key: string]: unknown;
}

export interface McpResourceTemplate {
  uriTemplate: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  [key: string]: unknown;
}

export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpPrompt {
  name: string;
  title?: string;
  description?: string;
  arguments?: McpPromptArgument[];
  [key: string]: unknown;
}

export interface McpDiscoveryResult {
  tools: McpTool[];
  resources: McpResource[];
  resourceTemplates: McpResourceTemplate[];
  prompts: McpPrompt[];
  capabilities: {
    tools?: boolean;
    resources?: boolean;
    resourceSubscriptions?: boolean;
    resourceListChanged?: boolean;
    prompts?: boolean;
    promptListChanged?: boolean;
    logging?: boolean;
  };
}
