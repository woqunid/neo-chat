import { useId, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Blocks, ExternalLink, Zap } from "lucide-react";
import SafeImage from "@/components/ui/SafeImage";
import { getSafeWebHref } from "@/lib/security/clientUrl";
import { useSettingsStore } from "@/store/core/settingsStore";
import type { Plugin } from "@/types";
import { ModalFrame } from "./ModalFrame";

interface Props {
  plugin: Plugin;
  onClose(): void;
  children: ReactNode;
}

export function PluginDetailsFrame(props: Props) {
  const t = useTranslations("Plugin");
  const id = useId();
  const active = useSettingsStore((state) =>
    state.activePlugins.includes(props.plugin.id),
  );
  return (
    <ModalFrame
      titleId={`${id}-title`}
      descriptionId={`${id}-description`}
      closeLabel={t("closeDetails")}
      onClose={props.onClose}
      wide
    >
      <PluginDetailsHeader
        id={id}
        plugin={props.plugin}
        active={active}
        spec={getSafeWebHref(props.plugin.manifestUrl)}
        docs={getSafeWebHref(props.plugin.externalDocsUrl)}
      />
      {props.children}
    </ModalFrame>
  );
}

interface HeaderProps {
  id: string;
  plugin: Plugin;
  active: boolean;
  spec: string | null;
  docs: string | null;
}

function PluginDetailsHeader(props: HeaderProps) {
  const t = useTranslations("Plugin");
  return (
    <div className="border-b border-gray-100 p-6 pr-14 dark:border-border">
      <div className="flex items-center gap-4">
        <SafeImage
          src={props.plugin.logoUrl}
          alt=""
          className="h-12 w-12 rounded-xl object-contain"
          fallback={<Blocks size={24} className="text-gray-400" />}
        />
        <div className="min-w-0">
          <h2 id={`${props.id}-title`} className="truncate text-lg font-bold">
            {props.plugin.title}
          </h2>
          <div className="flex gap-2 text-xs text-gray-500">
            {props.plugin.builtIn && (
              <span>
                <Zap size={10} />
                {t("builtIn")}
              </span>
            )}
            {props.active && <span>{t("active")}</span>}
            {props.spec && (
              <a href={props.spec} target="_blank" rel="noreferrer">
                {t("openApiSpec")}
                <ExternalLink size={10} />
              </a>
            )}
            {props.docs && (
              <a href={props.docs} target="_blank" rel="noreferrer">
                {t("docs")}
              </a>
            )}
          </div>
        </div>
      </div>
      <p
        id={`${props.id}-description`}
        className="mt-4 text-sm text-gray-600 dark:text-foreground/85"
      >
        {props.plugin.description}
      </p>
    </div>
  );
}
