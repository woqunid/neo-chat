import type { Plugin } from "../../../types";

export interface CustomMcpServerInstallInput {
  name: string;
  serverUrl: string;
  bearerToken?: string;
  authType?: "none" | "bearer" | "apiKey" | "oauth2";
  credential?: string;
  authKey?: string;
  authLocation?: "header" | "query";
  staticHeaders?: Record<string, string>;
}

export interface McpServerPageOptions {
  forceRefresh?: boolean;
  cursor?: string;
  search?: string;
  limit?: number;
}

export interface McpServerPage {
  plugins: Plugin[];
  nextCursor?: string;
}
