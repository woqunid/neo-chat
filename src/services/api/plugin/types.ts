import type { Plugin } from "../../../types";

export interface CustomMcpServerInstallInput {
  name: string;
  serverUrl: string;
  bearerToken?: string;
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
