import type { TextSkill } from "@/types";
import { MARKET_LIMITS } from "@/config/limits";
import { normalizeCustomSkills, normalizeTextSkill } from "../../../lib/skills";
import type { SettingsSlice, SettingsState } from "./types";
import {
  normalizeInstalledSkills,
  normalizeSkillIdRefsForStorage,
  syncCustomSkillsFromInstalled,
} from "./normalizers";

function prepareSkill(
  skill: TextSkill,
  options: { builtIn: boolean; isCustom?: boolean },
) {
  return normalizeTextSkill({
    ...skill,
    builtIn: options.builtIn,
    isCustom: options.isCustom || undefined,
    createdAt: skill.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

function mergeSkill(
  current: TextSkill,
  updates: Partial<TextSkill>,
  options: { builtIn: boolean; isCustom: boolean },
) {
  return normalizeTextSkill({
    ...current,
    ...updates,
    id: current.id,
    name: updates.name || current.name,
    activation: { ...current.activation, ...updates.activation },
    risk: { ...current.risk, ...updates.risk },
    ...options,
    updatedAt: new Date().toISOString(),
  });
}

function installSkill(state: SettingsState, skill: TextSkill) {
  const normalized = prepareSkill(skill, {
    builtIn: skill.builtIn === true,
    isCustom: skill.isCustom === true,
  });
  if (!normalized) return state;
  const installedSkills = normalizeInstalledSkills([
    normalized,
    ...state.installedSkills.filter((item) => item.id !== normalized.id),
  ]);
  return {
    installedSkills,
    customSkills: syncCustomSkillsFromInstalled(installedSkills),
  };
}

function uninstallSkill(state: SettingsState, skillId: string) {
  const id = normalizeSkillIdRefsForStorage([skillId], 1)[0];
  if (!id) return state;
  const installedSkills = state.installedSkills.filter(
    (skill) => skill.id !== id,
  );
  return {
    installedSkills,
    customSkills: syncCustomSkillsFromInstalled(installedSkills),
    activeSkillIds: state.activeSkillIds.filter((item) => item !== id),
  };
}

function updateInstalled(
  state: SettingsState,
  skillId: string,
  updates: Partial<TextSkill>,
) {
  const id = normalizeSkillIdRefsForStorage([skillId], 1)[0];
  if (!id) return state;
  let changed = false;
  const updated = state.installedSkills.map((current) => {
    if (current.id !== id) return current;
    const skill = mergeSkill(current, updates, {
      builtIn: current.builtIn === true,
      isCustom: true,
    });
    if (!skill) return current;
    changed = true;
    return {
      ...skill,
      builtIn: current.builtIn === true || undefined,
      isCustom: true,
    };
  });
  if (!changed) return state;
  const installedSkills = normalizeInstalledSkills(updated);
  return {
    installedSkills,
    customSkills: syncCustomSkillsFromInstalled(installedSkills),
  };
}

function addCustom(state: SettingsState, skill: TextSkill) {
  const normalized = prepareSkill(skill, { builtIn: false, isCustom: true });
  if (!normalized) return state;
  const custom = { ...normalized, builtIn: false, isCustom: true };
  const installedSkills = normalizeInstalledSkills([
    custom,
    ...state.installedSkills.filter((item) => item.id !== custom.id),
  ]);
  return {
    installedSkills,
    customSkills: normalizeCustomSkills(
      [custom, ...state.customSkills.filter((item) => item.id !== custom.id)],
      MARKET_LIMITS.maxCustomSkills,
    ),
  };
}

function updateCustom(
  state: SettingsState,
  skillId: string,
  updates: Partial<TextSkill>,
) {
  let changed = false;
  const update = (current: TextSkill) => {
    if (current.id !== skillId || current.builtIn) return current;
    const skill = mergeSkill(current, updates, {
      builtIn: false,
      isCustom: true,
    });
    if (!skill) return current;
    changed = true;
    return { ...skill, builtIn: false, isCustom: true };
  };
  const installedSkills = state.installedSkills.map(update);
  const customSkills = state.customSkills.map(update);
  if (!changed) return state;
  return {
    installedSkills: normalizeInstalledSkills(installedSkills),
    customSkills: normalizeCustomSkills(
      customSkills,
      MARKET_LIMITS.maxCustomSkills,
    ),
  };
}

function removeCustom(state: SettingsState, skillId: string) {
  return {
    installedSkills: state.installedSkills.filter(
      (skill) => skill.id !== skillId || skill.builtIn,
    ),
    customSkills: state.customSkills.filter((skill) => skill.id !== skillId),
    activeSkillIds: state.activeSkillIds.filter((id) => id !== skillId),
  };
}

export const createSkillSlice: SettingsSlice = (set) => ({
  installedSkills: [],
  customSkills: [],
  activeSkillIds: [],
  skillAutoSelect: true,
  installSkill: (skill) => set((state) => installSkill(state, skill)),
  uninstallSkill: (id) => set((state) => uninstallSkill(state, id)),
  updateInstalledSkill: (id, skill) =>
    set((state) => updateInstalled(state, id, skill)),
  addCustomSkill: (skill) => set((state) => addCustom(state, skill)),
  updateCustomSkill: (id, skill) =>
    set((state) => updateCustom(state, id, skill)),
  removeCustomSkill: (id) => set((state) => removeCustom(state, id)),
  setActiveSkillIds: (ids) =>
    set({ activeSkillIds: normalizeSkillIdRefsForStorage(ids) }),
  toggleSkillActive: (skillId) =>
    set((state) => {
      const id = normalizeSkillIdRefsForStorage([skillId], 1)[0];
      if (!id) return state;
      const active = state.activeSkillIds.includes(id);
      return {
        activeSkillIds: normalizeSkillIdRefsForStorage(
          active
            ? state.activeSkillIds.filter((item) => item !== id)
            : [...state.activeSkillIds, id],
        ),
      };
    }),
  setSkillAutoSelect: (enabled) => set({ skillAutoSelect: enabled }),
});
