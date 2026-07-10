"use client";

import React, { useId, useMemo, useRef, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import AnchoredPortal from "../ui/AnchoredPortal";
import {
  findSelectedLabel,
  flattenOptions,
  isGroupedOptions,
  useOptionNavigation,
  useSelectMenu,
  type GroupedSelectOption,
  type SelectOption,
  type SelectOptions,
} from "./useCustomSelect";

export type { GroupedSelectOption, SelectOption } from "./useCustomSelect";

type SelectIcon = React.ComponentType<
  {
    readonly size?: number;
  } & Pick<React.SVGProps<SVGSVGElement>, "className" | "aria-hidden">
>;

export interface CustomSelectProps {
  readonly id?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: SelectOptions;
  readonly icon?: SelectIcon;
  readonly className?: string;
  readonly selectButtonClassName?: string;
  readonly ariaLabel?: string;
}

interface OptionState {
  readonly value: string;
  readonly highlightedValue: string;
  readonly getOptionId: (value: string) => string;
  readonly onSelect: (value: string) => void;
}

interface OptionButtonProps extends OptionState {
  readonly option: SelectOption;
}

const MENU_MAX_HEIGHT = 240;
const DEFAULT_BUTTON_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm transition-[border-color,background-color,box-shadow] hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background disabled:hover:text-foreground flex items-center justify-between";

function OptionButton(props: OptionButtonProps) {
  const { option, value, highlightedValue, getOptionId, onSelect } = props;
  const isActive = value === option.value || highlightedValue === option.value;
  return (
    <button
      type="button"
      role="option"
      id={getOptionId(option.value)}
      aria-selected={value === option.value}
      onClick={() => onSelect(option.value)}
      className={`mb-0.5 flex w-full items-center justify-between rounded-sm px-3 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isActive
          ? "bg-accent text-accent-foreground font-medium"
          : "text-popover-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      <span className="truncate">{option.label}</span>
      {value === option.value && <Check size={14} aria-hidden="true" />}
    </button>
  );
}

interface GroupedOptionListProps extends OptionState {
  readonly groups: readonly GroupedSelectOption[];
}

function GroupedOptionList(props: GroupedOptionListProps) {
  const { groups, ...optionState } = props;
  return groups.map((group) => (
    <div key={group.label} role="group" aria-label={group.label}>
      <div className="mx-1 mb-1 rounded-sm bg-muted px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {group.label}
      </div>
      {group.options.map((option) => (
        <OptionButton key={option.value} option={option} {...optionState} />
      ))}
    </div>
  ));
}

interface OptionListProps extends OptionState {
  readonly options: SelectOptions;
}

function OptionList(props: OptionListProps) {
  const { options, ...optionState } = props;
  if (options.length === 0) return null;
  if (isGroupedOptions(options)) {
    return <GroupedOptionList groups={options} {...optionState} />;
  }
  return options.map((option) => (
    <OptionButton key={option.value} option={option} {...optionState} />
  ));
}

interface SelectTriggerProps {
  readonly id?: string;
  readonly Icon?: SelectIcon;
  readonly disabled: boolean;
  readonly isOpen: boolean;
  readonly listboxId: string;
  readonly label: string;
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly onClick: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

function SelectTrigger(props: SelectTriggerProps) {
  const {
    id,
    Icon,
    disabled,
    isOpen,
    listboxId,
    label,
    ariaLabel,
    className,
    onClick,
    onKeyDown,
  } = props;
  return (
    <button
      type="button"
      id={id}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-haspopup="listbox"
      aria-expanded={isOpen}
      aria-controls={isOpen ? listboxId : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={className || DEFAULT_BUTTON_CLASS}
    >
      <span className="flex items-center gap-2 truncate text-gray-700 dark:text-foreground">
        {Icon && (
          <Icon size={16} className="text-gray-500" aria-hidden="true" />
        )}
        <span className="truncate">{label}</span>
      </span>
      <ChevronDown
        size={14}
        aria-hidden="true"
        className={`text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
      />
    </button>
  );
}

interface SelectMenuProps extends OptionListProps {
  readonly anchorRef: React.RefObject<HTMLDivElement | null>;
  readonly listboxId: string;
  readonly ariaLabel?: string;
  readonly isOpen: boolean;
  readonly isClosing: boolean;
  readonly onClose: () => void;
}

function SelectMenu(props: SelectMenuProps) {
  const {
    anchorRef,
    listboxId,
    ariaLabel,
    isOpen,
    isClosing,
    onClose,
    ...optionListProps
  } = props;
  return (
    <AnchoredPortal
      anchorRef={anchorRef}
      open={isOpen}
      onClose={onClose}
      id={listboxId}
      role="listbox"
      ariaLabel={ariaLabel}
      aria-activedescendant={
        isOpen && props.highlightedValue
          ? props.getOptionId(props.highlightedValue)
          : undefined
      }
      placement="bottom-start"
      matchAnchorWidth
      maxHeight={MENU_MAX_HEIGHT}
      className={`z-50 overflow-hidden overflow-y-auto rounded-md border border-input bg-popover text-popover-foreground shadow-md custom-scrollbar transform transition-[opacity,transform] duration-200 origin-top ${
        isClosing
          ? "opacity-0 scale-95"
          : "opacity-100 scale-100 animate-in fade-in zoom-in-95"
      }`}
    >
      <div className="p-1">
        <OptionList {...optionListProps} />
      </div>
    </AnchoredPortal>
  );
}

export function CustomSelect(props: CustomSelectProps) {
  const t = useTranslations("Common");
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const hasOptions = props.options.length > 0;
  const flatOptions = useMemo(
    () => flattenOptions(props.options),
    [props.options],
  );
  const menu = useSelectMenu(hasOptions);
  const navigation = useOptionNavigation({
    value: props.value,
    flatOptions,
    isOpen: menu.isOpen,
    listboxId,
    openMenu: menu.openMenu,
    closeMenu: menu.closeMenu,
    onChange: props.onChange,
  });
  const label = hasOptions
    ? findSelectedLabel(props.options, props.value) ||
      props.value ||
      t("select")
    : t("noOptions");

  return (
    <div className={`relative ${props.className || ""}`} ref={containerRef}>
      <SelectTrigger
        id={props.id}
        Icon={props.icon}
        disabled={!hasOptions}
        isOpen={menu.isOpen}
        listboxId={listboxId}
        label={label}
        ariaLabel={props.ariaLabel}
        className={props.selectButtonClassName}
        onClick={menu.toggleMenu}
        onKeyDown={navigation.handleKeyDown}
      />
      <SelectMenu
        anchorRef={containerRef}
        listboxId={listboxId}
        ariaLabel={props.ariaLabel}
        isOpen={menu.isOpen && hasOptions}
        isClosing={menu.isClosing}
        onClose={menu.closeMenu}
        options={props.options}
        value={props.value}
        highlightedValue={navigation.highlightedValue}
        getOptionId={navigation.getOptionId}
        onSelect={navigation.commitOption}
      />
    </div>
  );
}
