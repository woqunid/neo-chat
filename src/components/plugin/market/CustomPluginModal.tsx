import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Blocks, Download, Loader2 } from "lucide-react";
import { installCustomPlugin } from "@/services/api/pluginService";
import type { Plugin } from "@/types";
import { CUSTOM_PLUGIN_INPUT_MAX_CHARS } from "./utils";
import { ModalFrame } from "./ModalFrame";

interface Props {
  onClose(): void;
  onInstall(plugin: Plugin): void;
}

function useCustomPluginInstall(props: Props) {
  const requestRef = useRef(0);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const install = async () => {
    if (!input.trim()) return;
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const plugin = await installCustomPlugin(input);
      if (request !== requestRef.current) return;
      props.onInstall(plugin);
      props.onClose();
    } catch (reason) {
      if (request === requestRef.current) setError(String(reason));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  };
  return { input, setInput, loading, error, install };
}

export function CustomPluginModal(props: Props) {
  const t = useTranslations("Plugin");
  const id = useId();
  const form = useCustomPluginInstall(props);
  return (
    <ModalFrame
      titleId={`${id}-title`}
      descriptionId={`${id}-description`}
      closeLabel={t("closeCustomInstaller")}
      onClose={props.onClose}
      disabled={form.loading}
    >
      <CustomPluginForm id={id} form={form} onClose={props.onClose} />
    </ModalFrame>
  );
}

function CustomPluginForm({
  id,
  form,
  onClose,
}: {
  id: string;
  form: ReturnType<typeof useCustomPluginInstall>;
  onClose(): void;
}) {
  const t = useTranslations("Plugin");
  return (
    <div className="space-y-4 p-6">
      <h2
        id={`${id}-title`}
        className="flex items-center gap-2 text-lg font-bold"
      >
        <Blocks size={20} className="text-blue-500" />
        {t("addCustomPlugin")}
      </h2>
      <p id={`${id}-description`} className="text-xs text-gray-500">
        {t("openApiHint")}
      </p>
      <textarea
        name="custom-plugin-manifest"
        value={form.input}
        maxLength={CUSTOM_PLUGIN_INPUT_MAX_CHARS}
        onChange={(event) => form.setInput(event.target.value)}
        placeholder={t("openApiPlaceholder")}
        className="h-52 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-3 font-mono text-xs dark:border-border dark:bg-muted"
      />
      {form.error && (
        <p role="alert" className="flex gap-2 text-xs text-red-600">
          <AlertTriangle size={14} />
          {form.error}
        </p>
      )}
      <CustomPluginActions form={form} onClose={onClose} />
    </div>
  );
}

function CustomPluginActions({
  form,
  onClose,
}: {
  form: ReturnType<typeof useCustomPluginInstall>;
  onClose(): void;
}) {
  const t = useTranslations("Plugin");
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onClose} disabled={form.loading}>
        {t("cancel")}
      </button>
      <button
        type="button"
        onClick={() => void form.install()}
        disabled={form.loading || !form.input.trim()}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {form.loading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Download size={16} />
        )}
        {t("install")}
      </button>
    </div>
  );
}
