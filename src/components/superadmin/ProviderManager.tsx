"use client";

import { Server } from "lucide-react";
import ProviderEditor from "./ProviderEditor";
import ProviderList from "./ProviderList";
import { useProviderAdmin } from "./useProviderAdmin";

export default function ProviderManager() {
  const admin = useProviderAdmin();

  return (
    <div className="grid min-h-[620px] overflow-hidden rounded-lg border border-border bg-background lg:grid-cols-[260px_minmax(0,1fr)]">
      <ProviderList
        providers={admin.providers}
        selectedIndex={admin.selectedIndex}
        busy={admin.busy}
        onAdd={admin.addProvider}
        onSelect={admin.setSelectedIndex}
      />
      {admin.selected ? (
        <ProviderEditor
          provider={admin.selected}
          modelsText={admin.modelsText}
          notice={admin.notice}
          busy={admin.busy}
          onUpdate={admin.updateSelected}
          onModelsTextChange={admin.setModelsText}
          onFetchModels={admin.fetchModels}
          onSave={admin.save}
          onDelete={admin.deleteSelected}
        />
      ) : (
        <EmptyProviderState />
      )}
    </div>
  );
}

function EmptyProviderState() {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <Server size={28} strokeWidth={1.5} aria-hidden="true" />
      <p className="text-sm">尚未添加模型服务商</p>
    </div>
  );
}
