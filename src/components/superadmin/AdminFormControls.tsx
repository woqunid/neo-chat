import type React from "react";
import type { LucideIcon } from "lucide-react";
import type { AdminNotice } from "./types";

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  type?: string;
  placeholder?: string;
  monospace?: boolean;
}

export function AdminTextField({
  label,
  value,
  onChange,
  className = "",
  type = "text",
  placeholder,
  monospace = false,
}: TextFieldProps) {
  return (
    <label className={`block space-y-2 text-sm font-medium ${className}`}>
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        className={`h-10 w-full rounded-md border border-input bg-background px-3 outline-none transition-shadow focus:ring-2 focus:ring-ring ${
          monospace ? "font-mono text-xs" : "text-sm"
        }`}
      />
    </label>
  );
}

export function AdminToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border pt-5">
      <span className="text-sm font-medium">{label}</span>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={onChange}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          checked ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export function AdminNoticeText({ notice }: { notice: AdminNotice | null }) {
  const color = getNoticeColor(notice);
  return (
    <p aria-live="polite" className={`min-h-4 text-xs ${color}`}>
      {notice?.message || ""}
    </p>
  );
}

function getNoticeColor(notice: AdminNotice | null): string {
  if (notice?.tone === "error") return "text-red-600 dark:text-red-400";
  if (notice?.tone === "success") {
    return "text-emerald-700 dark:text-emerald-300";
  }
  return "text-muted-foreground";
}

export function AdminActionButton({
  children,
  disabled,
  onClick,
  icon: Icon,
  tone = "default",
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  icon: LucideIcon;
  tone?: "default" | "primary" | "danger";
}) {
  const style = getActionStyle(tone);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${style}`}
    >
      <Icon size={15} aria-hidden="true" />
      {children}
    </button>
  );
}

function getActionStyle(tone: "default" | "primary" | "danger"): string {
  if (tone === "primary") {
    return "bg-foreground text-background hover:opacity-90";
  }
  if (tone === "danger") {
    return "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30";
  }
  return "border border-border bg-background hover:bg-muted";
}
