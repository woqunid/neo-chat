import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import type {
  McpResourceDescriptor,
  McpResourceTemplateDescriptor,
  Plugin,
} from "@/types";
import {
  listMcpResources,
  readMcpResourceContent,
  setMcpResourceSubscription,
} from "@/services/api/pluginService";
import { copyTextToClipboard } from "@/lib/utils/clipboard";

function formatResult(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function McpResourcesPanel({ plugin }: { plugin: Plugin }) {
  const t = useTranslations("Plugin");
  const [resources, setResources] = useState<McpResourceDescriptor[]>(
    plugin.mcp?.resources || [],
  );
  const [templates, setTemplates] = useState<McpResourceTemplateDescriptor[]>(
    plugin.mcp?.resourceTemplates || [],
  );
  const [uri, setUri] = useState(resources[0]?.uri || "");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [subscribedUris, setSubscribedUris] = useState<string[]>([]);
  const refresh = async () => {
    setLoading(true);
    try {
      const next = await listMcpResources(plugin);
      setResources(next.resources || []);
      setTemplates(next.resourceTemplates || []);
    } finally {
      setLoading(false);
    }
  };
  const read = async (target: string) => {
    if (!target.trim()) return;
    setLoading(true);
    try {
      setUri(target);
      setResult(formatResult(await readMcpResourceContent(plugin, target)));
    } finally {
      setLoading(false);
    }
  };
  const toggleSubscription = async (target: string) => {
    const subscribed = subscribedUris.includes(target);
    setLoading(true);
    try {
      await setMcpResourceSubscription(plugin, target, !subscribed);
      setSubscribedUris((current) =>
        subscribed
          ? current.filter((item) => item !== target)
          : [...current, target],
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={uri}
          onChange={(event) => setUri(event.target.value)}
          placeholder={t("mcpResourceUriPlaceholder")}
          className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm dark:border-border"
        />
        <button
          type="button"
          disabled={loading || !uri.trim()}
          onClick={() => void read(uri)}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {t("readMcpResource")}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
          aria-label={t("refreshMcpResources")}
          className="rounded-lg border px-3 dark:border-border"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {resources.map((resource) => (
          <div
            key={resource.uri}
            className="rounded-xl border p-3 dark:border-border"
          >
            <button
              type="button"
              onClick={() => void read(resource.uri)}
              className="w-full text-left"
            >
              <strong className="block truncate text-sm">
                {resource.title || resource.name}
              </strong>
              <span className="mt-1 block truncate font-mono text-xs text-muted-foreground">
                {resource.uri}
              </span>
            </button>
            {plugin.mcp?.capabilities?.resourceSubscriptions && (
              <button
                type="button"
                disabled={loading}
                onClick={() => void toggleSubscription(resource.uri)}
                className="mt-2 text-xs text-blue-600"
              >
                {subscribedUris.includes(resource.uri)
                  ? t("unsubscribeMcpResource")
                  : t("subscribeMcpResource")}
              </button>
            )}
          </div>
        ))}
      </div>
      {templates.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">
            {t("mcpResourceTemplates")}
          </h3>
          <ul className="space-y-2 text-xs text-muted-foreground">
            {templates.map((template) => (
              <li key={template.uriTemplate} className="rounded-lg border p-2">
                <strong>{template.title || template.name}</strong>
                <code className="mt-1 block break-all">
                  {template.uriTemplate}
                </code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result && (
        <div className="relative rounded-xl border bg-muted/40 p-3 dark:border-border">
          <button
            type="button"
            onClick={() => void copyTextToClipboard(result)}
            className="absolute right-2 top-2"
            aria-label={t("copyMcpContent")}
          >
            <Copy size={14} />
          </button>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words pr-8 text-xs">
            {result}
          </pre>
        </div>
      )}
    </div>
  );
}
