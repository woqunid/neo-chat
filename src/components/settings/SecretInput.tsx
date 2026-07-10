"use client";

import { useCallback, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

export interface SecretInputProps {
  readonly id: string;
  readonly name: string;
  readonly placeholder: string;
  readonly maxLength?: number;
  readonly hasSecret: boolean;
  readonly onSave: (value: string) => Promise<void> | void;
  readonly onClear?: () => Promise<void> | void;
  readonly inputClassName?: string;
}

function useSecretInput(props: SecretInputProps) {
  const [value, setValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const trimmedValue = value.trim();
  const runAction = useCallback(async (action: () => Promise<void> | void) => {
    setIsSaving(true);
    try {
      await action();
      setValue("");
    } finally {
      setIsSaving(false);
    }
  }, []);
  const save = useCallback(async () => {
    if (!trimmedValue || isSaving) return;
    await runAction(() => props.onSave(trimmedValue));
  }, [isSaving, props, runAction, trimmedValue]);
  const clear = useCallback(async () => {
    if (!props.onClear || isSaving) return;
    await runAction(props.onClear);
  }, [isSaving, props.onClear, runAction]);

  return { value, setValue, trimmedValue, isSaving, save, clear } as const;
}

interface SecretActionButtonsProps {
  readonly canSave: boolean;
  readonly canClear: boolean;
  readonly isSaving: boolean;
  readonly saveLabel: string;
  readonly clearLabel: string;
  readonly onSave: () => void;
  readonly onClear: () => void;
}

function SecretActionButtons(props: SecretActionButtonsProps) {
  return (
    <>
      <button
        type="button"
        aria-label={props.saveLabel}
        disabled={!props.canSave || props.isSaving}
        onClick={props.onSave}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white transition-colors hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Save size={15} aria-hidden="true" />
      </button>
      {props.canClear && (
        <button
          type="button"
          aria-label={props.clearLabel}
          disabled={props.isSaving}
          onClick={props.onClear}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-red-300"
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      )}
    </>
  );
}

export function SecretInput(props: SecretInputProps) {
  const t = useTranslations("Common");
  const state = useSecretInput(props);
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          id={props.id}
          name={props.name}
          type="password"
          value={state.value}
          onChange={(event) => state.setValue(event.target.value)}
          maxLength={props.maxLength}
          autoComplete="off"
          spellCheck={false}
          placeholder={
            props.hasSecret ? t("replaceSecretPlaceholder") : props.placeholder
          }
          className={
            props.inputClassName ||
            "min-w-0 flex-1 px-3 py-2 bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-[background-color,border-color,box-shadow,color] font-mono text-gray-800 dark:text-foreground"
          }
        />
        <SecretActionButtons
          canSave={Boolean(state.trimmedValue)}
          canClear={props.hasSecret && Boolean(props.onClear)}
          isSaving={state.isSaving}
          saveLabel={t("saveSecret")}
          clearLabel={t("clearSecret")}
          onSave={state.save}
          onClear={state.clear}
        />
      </div>
      <p className="text-[10px] text-gray-500 dark:text-muted-foreground">
        {props.hasSecret ? t("secretSaved") : t("secretNotSaved")}
      </p>
    </div>
  );
}
