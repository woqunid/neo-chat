import type { PluginAuthConfig } from "./pluginExecutionTypes";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function getTrimmedStringArg(
  args: Readonly<Record<string, unknown>>,
  key: string,
): string | null {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getConfiguredModel(
  authConfig: PluginAuthConfig | undefined,
): string | null {
  return typeof authConfig?.model === "string" && authConfig.model.trim()
    ? authConfig.model.trim()
    : null;
}

export function removeUndefinedFields(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

export function joinPluginUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
