"use client";

import { Plus } from "lucide-react";
import type { AdminProvider } from "./types";

export default function ProviderList({
  providers,
  selectedIndex,
  onAdd,
  onSelect,
}: {
  providers: AdminProvider[];
  selectedIndex: number;
  onAdd: () => void;
  onSelect: (index: number) => void;
}) {
  return (
    <aside className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">全局模型供应商</h1>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-md p-2 text-blue-600 hover:bg-blue-50"
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="space-y-2">
        {providers.map((provider, index) => (
          <button
            key={provider.id || index}
            type="button"
            onClick={() => onSelect(index)}
            className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
              index === selectedIndex
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-border bg-card"
            }`}
          >
            <span className="block truncate font-medium">{provider.name}</span>
            <span className="text-xs text-muted-foreground">
              {provider.type}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
