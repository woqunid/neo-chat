import { useTranslations } from "next-intl";
import type { Plugin, PluginFunction } from "@/types";
import { Switch } from "./Switch";
import { formatToolName } from "./utils";

interface Props {
  plugin: Plugin;
  disabledFunctions: string[];
  onToggle(functionName: string): void;
}

export function PluginToolsPanel({
  plugin,
  disabledFunctions,
  onToggle,
}: Props) {
  return (
    <div className="space-y-3" role="tabpanel">
      {plugin.functions?.map((pluginFunction) => (
        <PluginToolRow
          key={pluginFunction.name}
          pluginFunction={pluginFunction}
          pluginTitle={plugin.title}
          enabled={!disabledFunctions.includes(pluginFunction.name)}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

interface ToolRowProps {
  pluginFunction: PluginFunction;
  pluginTitle: string;
  enabled: boolean;
  onToggle(functionName: string): void;
}

function PluginToolRow(props: ToolRowProps) {
  const t = useTranslations("Plugin");
  const toolName = formatToolName(props.pluginFunction.name);
  const ariaLabel = props.enabled
    ? t("disableToolAria", { tool: toolName, title: props.pluginTitle })
    : t("enableToolAria", { tool: toolName, title: props.pluginTitle });
  return (
    <div className="flex items-start justify-between rounded-xl border border-gray-200 bg-white p-3 dark:border-border dark:bg-muted">
      <div className="min-w-0 pr-4">
        <div className="flex items-center gap-2">
          <strong className="truncate text-sm">{toolName}</strong>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase dark:bg-card">
            {props.pluginFunction.mcpToolName
              ? t("mcp")
              : props.pluginFunction.method}
          </span>
        </div>
        <code className="text-[10px] text-gray-400">
          {props.pluginFunction.name}
        </code>
        <p className="line-clamp-2 text-xs text-gray-600 dark:text-muted-foreground">
          {props.pluginFunction.description}
        </p>
        {props.pluginFunction.mcpAnnotations && (
          <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
            {props.pluginFunction.mcpAnnotations.readOnlyHint && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">
                {t("mcpReadOnlyHint")}
              </span>
            )}
            {props.pluginFunction.mcpAnnotations.destructiveHint && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">
                {t("mcpDestructiveHint")}
              </span>
            )}
            {props.pluginFunction.mcpAnnotations.idempotentHint && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-700">
                {t("mcpIdempotentHint")}
              </span>
            )}
            {props.pluginFunction.mcpAnnotations.openWorldHint && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                {t("mcpOpenWorldHint")}
              </span>
            )}
          </div>
        )}
      </div>
      <Switch
        checked={props.enabled}
        onChange={() => props.onToggle(props.pluginFunction.name)}
        size="sm"
        ariaLabel={ariaLabel}
      />
    </div>
  );
}
