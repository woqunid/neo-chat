interface SwitchProps {
  checked: boolean;
  onChange(): void;
  ariaLabel: string;
  size?: "sm" | "md";
  disabled?: boolean;
}

export function Switch({
  checked,
  onChange,
  ariaLabel,
  size = "md",
  disabled = false,
}: SwitchProps) {
  const sizeClass = size === "sm" ? "h-4 w-7" : "h-5 w-9";
  return (
    <label
      className={`relative inline-flex ${disabled ? "opacity-50" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      <span
        className={`${sizeClass} rounded-full bg-gray-200 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-green-500 peer-checked:after:translate-x-full peer-focus-visible:ring-2 peer-focus-visible:ring-green-500/60 dark:bg-accent`}
      />
    </label>
  );
}
