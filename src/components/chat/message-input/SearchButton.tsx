import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import Tooltip from "@/components/ui/Tooltip";
import { useSettingsStore } from "@/store/core/settingsStore";
import {
  ICON_BUTTON_BASE_CLASS,
  ICON_BUTTON_FOCUS_CLASS,
  INACTIVE_ICON_CLASS,
} from "./styles";

interface SearchButtonProps {
  readonly enabled: boolean;
  readonly busy: boolean;
  onChange: (enabled: boolean) => void;
}

export default function SearchButton(props: SearchButtonProps) {
  const t = useTranslations("MessageInput");
  const available = useSettingsStore(
    (state) => state.serverConfig?.search.available ?? false,
  );
  const enableBlocked = !props.enabled && !available;
  const mode = t("searchModeGrok");
  const tooltip = enableBlocked
    ? t("searchUnavailableGrok")
    : props.enabled
      ? t("disableSearchWithMode", { mode })
      : t("enableSearchWithMode", { mode });
  const activeClass = available
    ? "text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
    : "text-amber-500 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20";
  const ariaLabel = enableBlocked
    ? t("searchUnavailableGrok")
    : props.enabled
      ? t("disableSearchAria")
      : t("enableSearchAria");
  return (
    <Tooltip content={tooltip} position="top">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-pressed={props.enabled}
        className={`${ICON_BUTTON_BASE_CLASS} ${ICON_BUTTON_FOCUS_CLASS} transition-colors ${props.enabled ? activeClass : INACTIVE_ICON_CLASS}`}
        onClick={() => props.onChange(!props.enabled)}
        disabled={props.busy || enableBlocked}
      >
        <Globe size={16} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
