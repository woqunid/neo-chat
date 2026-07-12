import { useMemo } from "react";
import { ChevronDown, Cpu } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ModelInfo } from "@/services/api/chatService";
import Tooltip from "@/components/ui/Tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { truncateMiddle } from "@/lib/utils/messageInputHelpers";
import { ICON_BUTTON_FOCUS_CLASS } from "./styles";

const MODEL_LABEL_MAX_LENGTH = 30;

interface ModelSelectorProps {
  readonly models: ModelInfo[];
  readonly selectedModel: string;
  readonly open: boolean;
  readonly busy: boolean;
  setOpen: (open: boolean) => void;
  onSelect?: (model: string) => void;
}

function groupModels(models: ModelInfo[]): Record<string, ModelInfo[]> {
  return models.reduce<Record<string, ModelInfo[]>>((groups, model) => {
    const provider = model.providerName || "System";
    return { ...groups, [provider]: [...(groups[provider] ?? []), model] };
  }, {});
}

function ModelTrigger(props: ModelSelectorProps & { readonly name: string }) {
  const t = useTranslations("MessageInput");
  return (
    <Tooltip content={props.name} position="top">
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("selectModelAria", { model: props.name })}
          className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 md:w-auto md:max-w-52 dark:text-muted-foreground dark:hover:bg-accent/50 dark:hover:text-foreground ${ICON_BUTTON_FOCUS_CLASS}`}
          disabled={props.busy}
        >
          <Cpu size={16} className="md:hidden" aria-hidden="true" />
          <div className="hidden min-w-0 items-center gap-0.5 md:flex">
            <span className="max-w-44 truncate text-xs font-medium">
              {truncateMiddle(props.name, MODEL_LABEL_MAX_LENGTH)}
            </span>
            <ChevronDown
              size={12}
              aria-hidden="true"
              className={`opacity-50 transition-[opacity,transform] duration-200 group-hover:opacity-100 ${props.open ? "rotate-180" : ""}`}
            />
          </div>
        </button>
      </DropdownMenuTrigger>
    </Tooltip>
  );
}

function ModelItems(
  props: ModelSelectorProps & { readonly groups: Record<string, ModelInfo[]> },
) {
  const t = useTranslations("MessageInput");
  return (
    <DropdownMenuRadioGroup
      value={props.selectedModel}
      onValueChange={(model) => {
        props.onSelect?.(model);
        props.setOpen(false);
      }}
    >
      {Object.entries(props.groups).map(([provider, models]) => (
        <div key={provider}>
          <DropdownMenuLabel>{provider}</DropdownMenuLabel>
          {models.map((model) => (
            <DropdownMenuRadioItem
              value={model.name}
              aria-label={t("useModelAria", { model: model.displayName })}
              indicatorPosition="right"
              key={model.name}
              className={
                props.selectedModel === model.name
                  ? "font-medium text-brand"
                  : undefined
              }
            >
              <span className="truncate">{model.displayName}</span>
            </DropdownMenuRadioItem>
          ))}
        </div>
      ))}
    </DropdownMenuRadioGroup>
  );
}

export default function ModelSelector(props: ModelSelectorProps) {
  const t = useTranslations("MessageInput");
  const groups = useMemo(() => groupModels(props.models), [props.models]);
  const name =
    props.models.find((model) => model.name === props.selectedModel)
      ?.displayName ||
    props.selectedModel ||
    t("noModelSelected");
  return (
    <div className="relative">
      <DropdownMenu
        open={props.open && props.models.length > 0}
        onOpenChange={(open) => props.setOpen(open && props.models.length > 0)}
      >
        <ModelTrigger {...props} name={name} />
        <DropdownMenuContent
          side="top"
          align="end"
          className="max-h-64 w-56 overflow-y-auto custom-scrollbar"
        >
          <ModelItems {...props} groups={groups} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
