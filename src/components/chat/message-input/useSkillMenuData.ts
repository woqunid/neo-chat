import { useCallback, useMemo } from "react";
import { useChatStore } from "@/store/core/chatStore";
import { useSettingsStore } from "@/store/core/settingsStore";
import { normalizeSkillIdRefs } from "@/lib/skills";
import type { SkillMenuData } from "./types";

export function useSkillMenuData(): SkillMenuData {
  const currentSessionId = useChatStore((state) => state.currentSessionId);
  const sessions = useChatStore((state) => state.sessions);
  const updateSessionConfig = useChatStore(
    (state) => state.updateSessionConfig,
  );
  const installedSkills = useSettingsStore((state) => state.installedSkills);
  const session = useMemo(
    () => sessions.find((item) => item.id === currentSessionId),
    [currentSessionId, sessions],
  );
  const activeIds = useMemo(
    () => normalizeSkillIdRefs(session?.config?.activeSkills, installedSkills),
    [installedSkills, session?.config?.activeSkills],
  );
  const activeSet = useMemo(() => new Set(activeIds), [activeIds]);
  const skills = useMemo(
    () =>
      [...installedSkills].sort((left, right) =>
        left.title.localeCompare(right.title, undefined, {
          sensitivity: "base",
        }),
      ),
    [installedSkills],
  );
  const toggle = useCallback(
    (skillId: string) => {
      if (!currentSessionId) return;
      const nextIds = activeSet.has(skillId)
        ? activeIds.filter((id) => id !== skillId)
        : [...activeIds, skillId];
      updateSessionConfig(currentSessionId, {
        activeSkills: normalizeSkillIdRefs(nextIds, installedSkills),
      });
    },
    [
      activeIds,
      activeSet,
      currentSessionId,
      installedSkills,
      updateSessionConfig,
    ],
  );
  return { skills, activeIds, activeSet, toggle };
}
