"use client";

import { useCallback, useState } from "react";
import type { AdminNotice } from "./types";

interface AdminRequestOptions<T> {
  request: () => Promise<T>;
  onSuccess: (data: T) => void;
  fallback: string;
}

export function useAdminRequest() {
  const [notice, setNotice] = useState<AdminNotice | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async <T>(options: AdminRequestOptions<T>) => {
    setBusy(true);
    try {
      options.onSuccess(await options.request());
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : options.fallback,
      });
    } finally {
      setBusy(false);
    }
  }, []);

  return { notice, setNotice, busy, run };
}
