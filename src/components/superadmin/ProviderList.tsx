"use client";

import { Plus } from "lucide-react";
import type { AdminProvider } from "./types";

interface ProviderListProps {
  providers: AdminProvider[];
  selectedIndex: number;
  busy: boolean;
  onAdd: () => void;
  onSelect: (index: number) => void;
}

export default function ProviderList({
  providers,
  selectedIndex,
  busy,
  onAdd,
  onSelect,
}: ProviderListProps) {
  return (
    <aside className="border-b border-border bg-muted/20 lg:border-b-0 lg:border-r">
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold">服务商</h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            {providers.length}
          </span>
        </div>
        <button
          type="button"
          aria-label="添加服务商"
          title="添加服务商"
          disabled={busy}
          onClick={onAdd}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        >
          <Plus size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="flex gap-1 overflow-x-auto p-2 lg:flex-col lg:overflow-y-auto">
        {providers.map((provider, index) => {
          const selected = index === selectedIndex;
          return (
            <button
              key={provider.id || index}
              type="button"
              onClick={() => onSelect(index)}
              className={`min-w-48 rounded-md px-3 py-2.5 text-left transition-colors lg:min-w-0 ${
                selected
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              }`}
            >
              <span className="flex items-center">
                <span className="truncate text-sm font-medium">
                  {provider.name}
                </span>
              </span>
              <span className="mt-1 block truncate text-[11px]">
                {provider.type} · {provider.models.length} models
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
