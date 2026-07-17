import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Loader2, RefreshCw } from "lucide-react";
import type { McpPromptDescriptor, Plugin } from "@/types";
import {
  getMcpPromptContent,
  completeMcpPromptValue,
  listMcpPrompts,
} from "@/services/api/pluginService";
import { copyTextToClipboard } from "@/lib/utils/clipboard";

function formatResult(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function McpPromptsPanel({ plugin }: { plugin: Plugin }) {
  const t = useTranslations("Plugin");
  const [prompts, setPrompts] = useState<McpPromptDescriptor[]>(
    plugin.mcp?.prompts || [],
  );
  const [selected, setSelected] = useState<McpPromptDescriptor | null>(
    prompts[0] || null,
  );
  const [args, setArgs] = useState<Record<string, string>>({});
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const refresh = async () => {
    setLoading(true);
    try {
      const next = await listMcpPrompts(plugin);
      setPrompts(next || []);
      setSelected(next?.[0] || null);
      setArgs({});
    } finally {
      setLoading(false);
    }
  };
  const get = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      setResult(
        formatResult(await getMcpPromptContent(plugin, selected.name, args)),
      );
    } finally {
      setLoading(false);
    }
  };
  const complete = async (argumentName: string) => {
    if (!selected) return;
    const values = await completeMcpPromptValue(
      plugin,
      selected.name,
      argumentName,
      args[argumentName] || "",
    );
    setSuggestions((current) => ({ ...current, [argumentName]: values }));
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select
          value={selected?.name || ""}
          onChange={(event) => {
            setSelected(
              prompts.find((prompt) => prompt.name === event.target.value) ||
                null,
            );
            setArgs({});
          }}
          className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm dark:border-border"
        >
          <option value="">{t("selectMcpPrompt")}</option>
          {prompts.map((prompt) => (
            <option key={prompt.name} value={prompt.name}>
              {prompt.title || prompt.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
          aria-label={t("refreshMcpPrompts")}
          className="rounded-lg border px-3 py-2 dark:border-border"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
        </button>
      </div>
      {selected?.description && (
        <p className="text-sm text-muted-foreground">{selected.description}</p>
      )}
      {selected?.arguments?.map((argument) => (
        <label key={argument.name} className="block space-y-1 text-sm">
          <span>
            {argument.name}
            {argument.required ? " *" : ""}
          </span>
          <div className="flex gap-2">
            <input
              value={args[argument.name] || ""}
              onChange={(event) =>
                setArgs((current) => ({
                  ...current,
                  [argument.name]: event.target.value,
                }))
              }
              placeholder={argument.description}
              className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 dark:border-border"
            />
            <button
              type="button"
              onClick={() => void complete(argument.name)}
              className="rounded-lg border px-3 text-xs dark:border-border"
            >
              {t("completeMcpPromptArgument")}
            </button>
          </div>
          {suggestions[argument.name]?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestions[argument.name].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setArgs((current) => ({
                      ...current,
                      [argument.name]: value,
                    }))
                  }
                  className="rounded bg-muted px-2 py-1 text-xs"
                >
                  {value}
                </button>
              ))}
            </div>
          )}
        </label>
      ))}
      <button
        type="button"
        disabled={
          loading ||
          !selected ||
          selected.arguments?.some(
            (argument) => argument.required && !args[argument.name]?.trim(),
          )
        }
        onClick={() => void get()}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {t("getMcpPrompt")}
      </button>
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
