import { useEffect, useState } from "react";

const ERROR_DISPLAY_MS = 3000;

export function useTransientError() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), ERROR_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [error]);
  return { error, setError };
}
