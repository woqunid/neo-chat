import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import Tooltip from "@/components/ui/Tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSkillMenuData } from "./useSkillMenuData";
import {
  ICON_BUTTON_BASE_CLASS,
  ICON_BUTTON_FOCUS_CLASS,
  INACTIVE_ICON_CLASS,
} from "./styles";
import type { SkillMenuData } from "./types";

interface SkillMenuProps {
  readonly open: boolean;
  readonly busy: boolean;
  setOpen: (open: boolean) => void;
}

function SkillTrigger(props: SkillMenuProps & { readonly count: number }) {
  const t = useTranslations("MessageInput");
  const label = props.count
    ? t("activeSkillsCount", { count: props.count })
    : t("skills");
  return (
    <Tooltip content={label} position="top">
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            props.count
              ? t("activeSkillsAria", { count: props.count })
              : t("skills")
          }
          className={`${ICON_BUTTON_BASE_CLASS} ${ICON_BUTTON_FOCUS_CLASS} transition-colors ${props.count ? "text-emerald-500 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20" : INACTIVE_ICON_CLASS}`}
          disabled={props.busy}
        >
          <Sparkles size={16} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
    </Tooltip>
  );
}

function SkillItems({ data }: { readonly data: SkillMenuData }) {
  const t = useTranslations("MessageInput");
  if (data.skills.length === 0) {
    return (
      <div
        className="px-3 py-4 text-center text-xs text-muted-foreground"
        role="status"
      >
        {t("noSkillsAvailable")}
      </div>
    );
  }
  return (
    <>
      <DropdownMenuLabel>{t("installedSkills")}</DropdownMenuLabel>
      {data.skills.map((skill) => (
        <DropdownMenuCheckboxItem
          key={skill.id}
          checked={data.activeSet.has(skill.id)}
          indicatorPosition="right"
          indicator={
            <span className="flex h-3 w-3 items-center justify-center rounded-full border border-emerald-500 bg-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
            </span>
          }
          onSelect={(event) => event.preventDefault()}
          onCheckedChange={() => data.toggle(skill.id)}
        >
          <span className="truncate">{skill.title}</span>
        </DropdownMenuCheckboxItem>
      ))}
    </>
  );
}

export default function SkillMenu(props: SkillMenuProps) {
  const data = useSkillMenuData();
  return (
    <div className="relative">
      <DropdownMenu open={props.open} onOpenChange={props.setOpen}>
        <SkillTrigger {...props} count={data.activeIds.length} />
        <DropdownMenuContent
          side="top"
          align="start"
          className="max-h-64 w-64 overflow-y-auto custom-scrollbar"
        >
          <SkillItems data={data} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
