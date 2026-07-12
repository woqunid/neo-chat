import { useCallback, useEffect, useState } from "react";
import type { ComposerMenuName, ComposerMenuState } from "./types";

export function useComposerMenus(): ComposerMenuState {
  const [openMenu, setOpenMenu] = useState<ComposerMenuName | null>(null);
  const closeAll = useCallback(() => setOpenMenu(null), []);
  const isOpen = useCallback(
    (menu: ComposerMenuName) => openMenu === menu,
    [openMenu],
  );
  const setOpen = useCallback((menu: ComposerMenuName, open: boolean) => {
    setOpenMenu(open ? menu : null);
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAll();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [closeAll]);

  return { openMenu, isOpen, setOpen, closeAll };
}
