import type { LocalEncryptedSecretEnvelope } from "../security/localSecrets";

export type PluginFunctionRisk = "read" | "write" | "destructive" | "external";
export type PluginSource = "builtin" | "openapi" | "mcp";
export type McpTransport = "streamable-http";

export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpResourceDescriptor {
  uri: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
}

export interface McpResourceTemplateDescriptor {
  uriTemplate: string;
  name: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

export interface McpPromptArgumentDescriptor {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpPromptDescriptor {
  name: string;
  title?: string;
  description?: string;
  arguments?: McpPromptArgumentDescriptor[];
}

export interface McpRootDescriptor {
  uri: string;
  name?: string;
}

export interface McpServerCapabilitySummary {
  tools?: boolean;
  resources?: boolean;
  resourceSubscriptions?: boolean;
  resourceListChanged?: boolean;
  prompts?: boolean;
  promptListChanged?: boolean;
  logging?: boolean;
}

export interface PluginFunction {
  name: string;
  description: string;
  parameters: any;
  path?: string;
  method?: string;
  mcpToolName?: string;
  outputSchema?: Record<string, unknown>;
  mcpAnnotations?: McpToolAnnotations;
  risk?: PluginFunctionRisk;
}

export interface PluginMcpMetadata {
  transport: McpTransport;
  serverUrl: string;
  serverName: string;
  serverVersion?: string;
  headers?: Record<string, string>;
  toolNameMap?: Record<string, string>;
  capabilities?: McpServerCapabilitySummary;
  resources?: McpResourceDescriptor[];
  resourceTemplates?: McpResourceTemplateDescriptor[];
  prompts?: McpPromptDescriptor[];
  lastSyncedAt?: string;
}

export interface PluginAuth {
  type: "bearer" | "apiKey" | "basic" | "oauth2" | "none";
  name?: string;
  in?: "header" | "query";
  required?: boolean;
}

export interface Plugin {
  id: string;
  title: string;
  description: string;
  logoUrl: string;
  manifestUrl: string;
  externalDocsUrl?: string;
  baseUrl?: string;
  functions: PluginFunction[];
  source?: PluginSource;
  mcp?: PluginMcpMetadata;
  category?: string;
  categories?: string[];
  added?: string;
  builtIn?: boolean;
  auth?: PluginAuth;
}

export interface PluginConfig {
  enabledFunctions?: string[];
  disabledFunctions?: string[];
  baseUrl?: string;
  model?: string;
  auth?: {
    type: "bearer" | "apiKey" | "oauth2" | "none";
    value?: string;
    localValueSecret?: LocalEncryptedSecretEnvelope;
    key?: string;
    addTo?: "header" | "query";
  };
  mcp?: {
    trusted?: boolean;
    roots?: McpRootDescriptor[];
  };
}
