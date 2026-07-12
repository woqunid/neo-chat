import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Blocks,
  Download,
  Loader2,
  Settings,
  Zap,
} from "lucide-react";
import SafeImage from "@/components/ui/SafeImage";
import { hasPluginAuthValue } from "@/lib/security/localSecretResolvers";
import { isPluginAuthRequired } from "@/lib/plugin/config";
import type { Plugin, PluginConfig } from "@/types";
import { Switch } from "./Switch";
import { formatCategoryName } from "./utils";

function PluginLogo({ plugin, size = 48 }: { plugin: Plugin; size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="shrink-0 rounded-xl border border-gray-100 bg-white p-2 dark:border-input dark:bg-accent"
    >
      <SafeImage
        src={plugin.logoUrl}
        alt=""
        className="h-full w-full object-contain"
        fallback={<Blocks size={20} className="text-gray-400" />}
      />
    </div>
  );
}

function PluginBadges({ plugin }: { plugin: Plugin }) {
  const t = useTranslations("Plugin");
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {plugin.builtIn && (
        <span className="flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-[9px] text-purple-700">
          <Zap size={8} />
          {t("builtIn")}
        </span>
      )}
      {plugin.source === "mcp" && (
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] text-emerald-700">
          {t("mcp")}
        </span>
      )}
      {plugin.mcp && (
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-500">
          {plugin.mcp.transport}
        </span>
      )}
      {plugin.category && (
        <span className="max-w-28 truncate rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600">
          {formatCategoryName(plugin.category)}
        </span>
      )}
    </div>
  );
}

interface InstalledCardProps {
  plugin: Plugin;
  active: boolean;
  config?: PluginConfig;
  onToggle(): void;
  onDetails(): void;
}

export function InstalledPluginCard(props: InstalledCardProps) {
  const t = useTranslations("Plugin");
  const missingAuth =
    isPluginAuthRequired(props.plugin) &&
    !hasPluginAuthValue(props.config?.auth) &&
    props.plugin.id !== "unsplash";
  return (
    <article className="flex flex-col rounded-2xl border border-gray-200 bg-white/40 p-4 dark:border-border dark:bg-muted/40">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PluginLogo plugin={props.plugin} />
          <PluginBadges plugin={props.plugin} />
        </div>
        <Switch
          checked={props.active}
          onChange={props.onToggle}
          disabled={missingAuth}
          ariaLabel={
            props.active
              ? t("disablePluginAria", { title: props.plugin.title })
              : t("enablePluginAria", { title: props.plugin.title })
          }
        />
      </div>
      <h3 className="truncate font-semibold">{props.plugin.title}</h3>
      <p className="mb-3 line-clamp-2 flex-1 text-xs text-gray-500">
        {props.plugin.description}
      </p>
      {missingAuth && (
        <p className="mb-3 flex items-center gap-1 text-[10px] text-amber-600">
          <AlertTriangle size={12} />
          {t("authMissing")}
        </p>
      )}
      <InstalledCardFooter plugin={props.plugin} onDetails={props.onDetails} />
    </article>
  );
}

function InstalledCardFooter({
  plugin,
  onDetails,
}: {
  plugin: Plugin;
  onDetails(): void;
}) {
  const t = useTranslations("Plugin");
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-gray-400">
        {t(
          plugin.source === "mcp"
            ? "installedMcpTools"
            : "installedPluginTools",
          { count: plugin.functions?.length || 0 },
        )}
      </span>
      <button
        type="button"
        aria-label={t("configureAria", { title: plugin.title })}
        onClick={onDetails}
      >
        <Settings size={16} />
      </button>
    </div>
  );
}

export function AvailablePluginCard({
  plugin,
  installing,
  onInstall,
}: {
  plugin: Plugin;
  installing: boolean;
  onInstall(): void;
}) {
  const t = useTranslations("Plugin");
  return (
    <article className="flex flex-col rounded-2xl border border-gray-200 bg-white/40 p-4 dark:border-border dark:bg-muted/40">
      <div className="mb-3 flex items-center gap-3">
        <PluginLogo plugin={plugin} size={40} />
        <PluginBadges plugin={plugin} />
      </div>
      <h3 className="truncate text-sm font-semibold">{plugin.title}</h3>
      <p className="mb-4 line-clamp-2 flex-1 text-xs text-gray-500">
        {plugin.description}
      </p>
      <button
        type="button"
        aria-busy={installing || undefined}
        onClick={onInstall}
        disabled={installing}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-50 py-2 text-xs hover:bg-blue-50 disabled:opacity-50 dark:bg-accent/50"
      >
        {installing ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Download size={14} />
        )}
        {t("install")}
      </button>
    </article>
  );
}
