"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Search, Server, ShieldCheck } from "lucide-react";
import GrokSearchEditor from "./GrokSearchEditor";
import ProviderManager from "./ProviderManager";
import type { SuperAdminSection } from "./types";

const SECTIONS = [
  { id: "providers" as const, label: "模型服务商", icon: Server },
  { id: "grok-search" as const, label: "Grok 联网", icon: Search },
];

export default function SuperAdminPage() {
  const [section, setSection] = useState<SuperAdminSection>("providers");

  return (
    <main className="min-h-dvh bg-muted/20 text-foreground">
      <AdminHeader />
      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[208px_minmax(0,1fr)] lg:gap-10 lg:py-8">
        <SectionNavigation selected={section} onSelect={setSection} />
        <AdminWorkspace section={section} />
      </div>
    </main>
  );
}

function AdminHeader() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
            <ShieldCheck size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Neo Chat</p>
            <p className="text-xs text-muted-foreground">Super Admin</p>
          </div>
        </div>
        <Link
          href="/"
          aria-label="返回聊天"
          title="返回聊天"
          className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span className="hidden sm:inline">返回聊天</span>
        </Link>
      </div>
    </header>
  );
}

function SectionNavigation({
  selected,
  onSelect,
}: {
  selected: SuperAdminSection;
  onSelect: (section: SuperAdminSection) => void;
}) {
  return (
    <nav aria-label="管理分区" className="min-w-0">
      <p className="mb-2 hidden px-3 text-xs font-medium text-muted-foreground lg:block">
        系统配置
      </p>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 lg:block lg:space-y-1 lg:bg-transparent lg:p-0">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={selected === id ? "page" : undefined}
            onClick={() => onSelect(id)}
            className={`flex h-10 min-w-0 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors lg:w-full lg:justify-start ${
              selected === id
                ? "bg-background text-foreground shadow-sm ring-1 ring-border lg:bg-muted lg:shadow-none lg:ring-0"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground lg:hover:bg-muted"
            }`}
          >
            <Icon size={16} aria-hidden="true" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function AdminWorkspace({ section }: { section: SuperAdminSection }) {
  const title = section === "providers" ? "模型服务商" : "Grok 联网";
  return (
    <section className="min-w-0">
      <h1 className="mb-5 text-xl font-semibold sm:text-2xl">{title}</h1>
      {section === "providers" ? <ProviderManager /> : <GrokSearchEditor />}
    </section>
  );
}
