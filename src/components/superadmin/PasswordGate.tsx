"use client";

import type { FormEvent } from "react";

export default function PasswordGate({
  password,
  status,
  busy,
  configured,
  canSubmit,
  onPasswordChange,
  onSubmit,
}: {
  password: string;
  status: string;
  busy: boolean;
  configured: boolean;
  canSubmit: boolean;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <main className="min-h-dvh bg-background px-5 py-10 text-foreground">
      <form
        onSubmit={onSubmit}
        className="mx-auto mt-24 max-w-sm space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm"
      >
        <h1 className="text-lg font-semibold">超级管理员</h1>
        <p className="text-sm text-muted-foreground">
          输入模型供应商管理密码。
        </p>
        <input
          className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm"
          type="password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          disabled={!configured || busy}
        />
        <button
          type="submit"
          disabled={!canSubmit || !configured}
          className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-blue-500 text-sm font-medium text-white disabled:opacity-50"
        >
          进入
        </button>
        {status ? <p className="text-sm text-red-600">{status}</p> : null}
      </form>
    </main>
  );
}
