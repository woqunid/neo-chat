import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface GroupedSelectOption {
  readonly label: string;
  readonly options: readonly SelectOption[];
}

export type SelectOptions =
  readonly SelectOption[] | readonly GroupedSelectOption[];

const CLOSE_ANIMATION_MS = 200;
const NAVIGATION_KEYS = ["ArrowDown", "ArrowUp", "Home", "End"] as const;
type NavigationKey = (typeof NAVIGATION_KEYS)[number];

export function isGroupedOptions(
  options: SelectOptions,
): options is readonly GroupedSelectOption[] {
  return options.length > 0 && "options" in options[0];
}

export function flattenOptions(options: SelectOptions): SelectOption[] {
  if (!isGroupedOptions(options)) return [...options] as SelectOption[];
  return options.flatMap((group) => group.options);
}

export function findSelectedLabel(
  options: SelectOptions,
  value: string,
): string | undefined {
  return flattenOptions(options).find((option) => option.value === value)
    ?.label;
}

function isNavigationKey(key: string): key is NavigationKey {
  return NAVIGATION_KEYS.some((navigationKey) => navigationKey === key);
}

function getNavigationTarget(options: {
  readonly key: NavigationKey;
  readonly currentValue: string;
  readonly flatOptions: readonly SelectOption[];
}): string {
  const { key, currentValue, flatOptions } = options;
  const currentIndex = Math.max(
    0,
    flatOptions.findIndex((option) => option.value === currentValue),
  );
  const lastIndex = flatOptions.length - 1;

  if (key === "Home") return flatOptions[0].value;
  if (key === "End") return flatOptions[lastIndex].value;
  if (key === "ArrowUp") {
    return flatOptions[Math.max(currentIndex - 1, 0)].value;
  }
  return flatOptions[Math.min(currentIndex + 1, lastIndex)].value;
}

export function useSelectMenu(hasOptions: boolean) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (!closeTimerRef.current) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const closeMenu = useCallback(() => {
    clearCloseTimer();
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setIsOpen(false);
      setIsClosing(false);
    }, CLOSE_ANIMATION_MS);
  }, [clearCloseTimer]);

  const openMenu = useCallback(() => {
    clearCloseTimer();
    setIsClosing(false);
    setIsOpen(true);
  }, [clearCloseTimer]);

  const toggleMenu = useCallback(() => {
    if (!hasOptions) return;
    if (isOpen) closeMenu();
    else openMenu();
  }, [closeMenu, hasOptions, isOpen, openMenu]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);
  return { isOpen, isClosing, closeMenu, openMenu, toggleMenu } as const;
}

interface OptionNavigationOptions {
  readonly value: string;
  readonly flatOptions: readonly SelectOption[];
  readonly isOpen: boolean;
  readonly listboxId: string;
  readonly openMenu: () => void;
  readonly closeMenu: () => void;
  readonly onChange: (value: string) => void;
}

export function useOptionNavigation(options: OptionNavigationOptions) {
  const {
    value,
    flatOptions,
    isOpen,
    listboxId,
    openMenu,
    closeMenu,
    onChange,
  } = options;
  const [highlightedValue, setHighlightedValue] = useState(value);

  useEffect(() => setHighlightedValue(value), [value]);
  const getOptionId = useCallback(
    (optionValue: string) =>
      `${listboxId}-option-${optionValue.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    [listboxId],
  );
  const commitOption = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
      closeMenu();
    },
    [closeMenu, onChange],
  );
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (flatOptions.length === 0) return;
      if (event.key === "Enter") {
        if (!isOpen) return;
        event.preventDefault();
        commitOption(highlightedValue || value);
        return;
      }
      if (!isNavigationKey(event.key)) return;
      event.preventDefault();
      openMenu();
      setHighlightedValue(
        getNavigationTarget({
          key: event.key,
          currentValue: highlightedValue,
          flatOptions,
        }),
      );
    },
    [commitOption, flatOptions, highlightedValue, isOpen, openMenu, value],
  );

  return {
    highlightedValue,
    getOptionId,
    commitOption,
    handleKeyDown,
  } as const;
}
