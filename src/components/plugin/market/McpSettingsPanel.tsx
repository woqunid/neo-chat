import { useTranslations } from "next-intl";
import type { PluginConfig } from "@/types";

interface Props {
  config: PluginConfig;
  rootsText: string;
  setRootsText(value: string): void;
  setTrusted(value: boolean): void;
  saveRoots(): void;
}

export function McpSettingsPanel(props: Props) {
  const t = useTranslations("Plugin");
  return (
    <section className="space-y-4 rounded-xl border p-4 dark:border-border">
      <div>
        <h3 className="text-sm font-semibold">{t("mcpSecurityTitle")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("mcpSecurityDescription")}
        </p>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={props.config.mcp?.trusted === true}
          onChange={(event) => props.setTrusted(event.target.checked)}
          className="mt-0.5"
        />
        <span>
          <strong>{t("mcpTrustServer")}</strong>
          <span className="mt-1 block text-xs text-muted-foreground">
            {t("mcpTrustServerHint")}
          </span>
        </span>
      </label>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="mcp-roots">
          {t("mcpRootsLabel")}
        </label>
        <textarea
          id="mcp-roots"
          value={props.rootsText}
          onChange={(event) => props.setRootsText(event.target.value)}
          placeholder={t("mcpRootsPlaceholder")}
          className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 font-mono text-xs dark:border-border"
        />
        <p className="text-xs text-muted-foreground">{t("mcpRootsHint")}</p>
        <button
          type="button"
          onClick={props.saveRoots}
          className="rounded-lg border px-3 py-1.5 text-xs dark:border-border"
        >
          {t("saveMcpRoots")}
        </button>
      </div>
    </section>
  );
}
