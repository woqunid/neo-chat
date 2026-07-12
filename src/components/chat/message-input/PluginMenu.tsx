import { Blocks } from "lucide-react";
import { useTranslations } from "next-intl";
import Tooltip from "@/components/ui/Tooltip";
import SafeImage from "@/components/ui/SafeImage";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePluginMenuData, type PluginMenuData } from "./usePluginMenuData";
import {
  ICON_BUTTON_BASE_CLASS,
  ICON_BUTTON_FOCUS_CLASS,
  INACTIVE_ICON_CLASS,
} from "./styles";
import type { Plugin } from "@/types";

interface PluginMenuProps {
  readonly open: boolean;
  readonly busy: boolean;
  setOpen: (open: boolean) => void;
}

function PluginTrigger(props: PluginMenuProps & { readonly count: number }) {
  const t = useTranslations("MessageInput");
  const label = props.count
    ? t("activePluginsCount", { count: props.count })
    : t("plugins");
  return (
    <Tooltip content={label} position="top">
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            props.count
              ? t("activePluginsAria", { count: props.count })
              : t("plugins")
          }
          className={`${ICON_BUTTON_BASE_CLASS} ${ICON_BUTTON_FOCUS_CLASS} transition-colors ${props.count ? "text-cyan-500 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20" : INACTIVE_ICON_CLASS}`}
          disabled={props.busy}
        >
          <Blocks size={16} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
    </Tooltip>
  );
}

interface PluginItemProps {
  readonly plugin: Plugin;
  readonly active: boolean;
  toggle: () => void;
}

function PluginItem(props: PluginItemProps) {
  const t = useTranslations("MessageInput");
  return (
    <DropdownMenuCheckboxItem
      checked={props.active}
      aria-label={
        props.active
          ? t("disablePlugin", { title: props.plugin.title })
          : t("enablePlugin", { title: props.plugin.title })
      }
      indicatorPosition="right"
      indicator={
        <span className="flex h-3 w-3 items-center justify-center rounded-full border border-cyan-500 bg-cyan-500">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
        </span>
      }
      onSelect={(event) => event.preventDefault()}
      onCheckedChange={props.toggle}
    >
      <span className="flex min-w-0 items-center gap-2 truncate">
        <SafeImage
          src={props.plugin.logoUrl}
          className="h-4 w-4 object-contain"
          alt=""
          fallback={<Blocks size={14} aria-hidden="true" />}
        />
        <span className="truncate">{props.plugin.title}</span>
      </span>
    </DropdownMenuCheckboxItem>
  );
}

function PluginSection(props: {
  readonly plugins: Plugin[];
  readonly data: PluginMenuData;
}) {
  return props.plugins.map((plugin) => (
    <PluginItem
      key={plugin.id}
      plugin={plugin}
      active={props.data.activeIds.includes(plugin.id)}
      toggle={() => props.data.toggle(plugin.id)}
    />
  ));
}

function PluginItems({ data }: { readonly data: PluginMenuData }) {
  const t = useTranslations("MessageInput");
  if (data.validPlugins.length === 0) {
    return (
      <div
        className="px-3 py-4 text-center text-xs text-muted-foreground"
        role="status"
      >
        {data.installedCount
          ? t("pluginsMissingAuth")
          : t("noPluginsInstalled")}{" "}
        <br />
        {t("visitPluginMarket")}
      </div>
    );
  }
  return (
    <>
      {data.groups.plugins.length > 0 && (
        <DropdownMenuLabel>{t("installedPlugins")}</DropdownMenuLabel>
      )}
      <PluginSection plugins={data.groups.plugins} data={data} />
      {data.groups.mcp.length > 0 && (
        <>
          {data.groups.plugins.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuLabel>{t("mcpServers")}</DropdownMenuLabel>
          <PluginSection plugins={data.groups.mcp} data={data} />
        </>
      )}
    </>
  );
}

export default function PluginMenu(props: PluginMenuProps) {
  const data = usePluginMenuData();
  return (
    <div className="relative">
      <DropdownMenu open={props.open} onOpenChange={props.setOpen}>
        <PluginTrigger {...props} count={data.activeIds.length} />
        <DropdownMenuContent
          side="top"
          align="start"
          className="max-h-64 w-64 overflow-y-auto custom-scrollbar"
        >
          <PluginItems data={data} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
