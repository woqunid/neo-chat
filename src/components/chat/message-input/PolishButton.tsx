import { Loader2, PencilSparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import Tooltip from "@/components/ui/Tooltip";
import { ICON_BUTTON_BASE_CLASS, ICON_BUTTON_FOCUS_CLASS } from "./styles";

interface PolishButtonProps {
  readonly hasText: boolean;
  readonly busy: boolean;
  readonly polishing: boolean;
  polish: () => void;
}

export default function PolishButton(props: PolishButtonProps) {
  const t = useTranslations("MessageInput");
  const label = props.polishing ? t("polishingText") : t("polishText");
  const color = props.hasText
    ? "text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground hover:bg-gray-100 dark:hover:bg-accent/50"
    : "text-gray-300 dark:text-muted-foreground/40";
  return (
    <Tooltip content={label} position="top">
      <button
        type="button"
        aria-label={t("polishTextAria")}
        aria-busy={props.polishing || undefined}
        disabled={props.busy || props.polishing || !props.hasText}
        className={`${ICON_BUTTON_BASE_CLASS} ${ICON_BUTTON_FOCUS_CLASS} ${color} transition-colors disabled:cursor-not-allowed disabled:opacity-50`}
        onClick={props.polish}
      >
        {props.polishing ? (
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <PencilSparkles size={16} aria-hidden="true" />
        )}
      </button>
    </Tooltip>
  );
}
