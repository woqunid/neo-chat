import { useEffect, useRef, type RefObject } from "react";

export function useAliveRef(): RefObject<boolean> {
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  return aliveRef;
}
