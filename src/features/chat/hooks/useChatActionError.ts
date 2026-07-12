"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ACTION_ERROR_DURATION_MS = 5_000;

export function useChatActionError() {
  const [actionError, setActionError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearActionError = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setActionError(null);
  }, []);

  const showActionError = useCallback(
    (message: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setActionError(message);
      timerRef.current = setTimeout(clearActionError, ACTION_ERROR_DURATION_MS);
    },
    [clearActionError],
  );

  useEffect(() => clearActionError, [clearActionError]);

  return { actionError, showActionError };
}
