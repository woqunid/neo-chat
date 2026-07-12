import { LobeAgent } from "@/types";
import { useSettingsStore } from "@/store/core/settingsStore";
import { readJsonResponseOrThrow, signedApiFetch } from "../../lib/api/client";
import {
  normalizeAgentDetail,
  normalizeMarketAgents,
} from "../../lib/market/agents";
import {
  normalizeAgentMarketLocale,
  type AgentMarketLocale,
} from "../../lib/market/agentLocale";
import { logDevError, logDevInfo, logDevWarn } from "../../lib/utils/devLogger";
import { CACHE_CONFIG } from "../../config/api";

const CACHE_DURATION = CACHE_CONFIG.agents;
const DEFAULT_RANDOM_AGENT_COUNT = 4;

type AgentListResponse = {
  agents?: LobeAgent[];
  unavailable?: boolean;
};

const agentListRequests = new Map<AgentMarketLocale, Promise<LobeAgent[]>>();

interface StaleAgentOptions {
  locale: AgentMarketLocale;
  marketAgents?: LobeAgent[];
  marketAgentsLocale?: string;
}

function getStaleAgents(options: StaleAgentOptions): LobeAgent[] {
  if (options.marketAgentsLocale !== options.locale) return [];
  return options.marketAgents?.length
    ? normalizeMarketAgents(options.marketAgents)
    : [];
}

function logStaleCacheUsage(message: string, agents: LobeAgent[]): void {
  if (agents.length > 0) logDevWarn(message);
}

async function reuseAgentRequest(
  request: Promise<LobeAgent[]>,
  staleAgents: LobeAgent[],
): Promise<LobeAgent[]> {
  logDevInfo("Reusing in-flight agents request");
  try {
    return await request;
  } catch (error) {
    logDevError("Error fetching agents:", error);
    logStaleCacheUsage("Using stale cache due to fetch error", staleAgents);
    return staleAgents;
  }
}

interface FetchAgentListOptions {
  locale: AgentMarketLocale;
  staleAgents: LobeAgent[];
  setMarketAgents: ReturnType<
    typeof useSettingsStore.getState
  >["setMarketAgents"];
}

async function fetchAgentList(
  options: FetchAgentListOptions,
): Promise<LobeAgent[]> {
  logDevInfo("Fetching agents from API...");
  const response = await signedApiFetch(`/api/agents?locale=${options.locale}`);
  if (!response.ok) throw new Error("Failed to fetch agents");
  const data = await readJsonResponseOrThrow<AgentListResponse>(
    response,
    "Failed to fetch agents",
  );
  if (data.unavailable) {
    logStaleCacheUsage(
      "Using stale cache because agent registry is unavailable",
      options.staleAgents,
    );
    return options.staleAgents;
  }
  const agents = normalizeMarketAgents(data.agents);
  options.setMarketAgents(agents, options.locale);
  logDevInfo(`Cached ${agents.length} agents`);
  return agents;
}

interface SettleAgentRequestOptions {
  locale: AgentMarketLocale;
  request: Promise<LobeAgent[]>;
  staleAgents: LobeAgent[];
}

async function settleAgentRequest(
  options: SettleAgentRequestOptions,
): Promise<LobeAgent[]> {
  try {
    return await options.request;
  } catch (error) {
    logDevError("Error fetching agents:", error);
    logStaleCacheUsage(
      "Using stale cache due to fetch error",
      options.staleAgents,
    );
    return options.staleAgents;
  } finally {
    if (agentListRequests.get(options.locale) === options.request) {
      agentListRequests.delete(options.locale);
    }
  }
}

export const getCachedAgentsForLocale = (
  requestedLocale: string = "en",
): LobeAgent[] => {
  const locale = normalizeAgentMarketLocale(requestedLocale);
  const { marketAgents, marketAgentsTimestamp, marketAgentsLocale } =
    useSettingsStore.getState();

  if (
    !marketAgents ||
    marketAgents.length === 0 ||
    !marketAgentsTimestamp ||
    marketAgentsLocale !== locale
  ) {
    return [];
  }

  if (Date.now() - marketAgentsTimestamp >= CACHE_DURATION) {
    return [];
  }

  return normalizeMarketAgents(marketAgents);
};

export const getAgents = async (
  forceRefresh: boolean = false,
  requestedLocale: string = "en",
): Promise<LobeAgent[]> => {
  const locale = normalizeAgentMarketLocale(requestedLocale);
  const { marketAgents, marketAgentsLocale, setMarketAgents } =
    useSettingsStore.getState();
  const cachedAgents = getCachedAgentsForLocale(locale);
  if (!forceRefresh && cachedAgents.length > 0) {
    logDevInfo("Using cached agents data");
    return cachedAgents;
  }
  const staleAgents = getStaleAgents({
    locale,
    marketAgents,
    marketAgentsLocale,
  });
  const inFlightRequest = agentListRequests.get(locale);
  if (!forceRefresh && inFlightRequest) {
    return reuseAgentRequest(inFlightRequest, staleAgents);
  }
  const request = fetchAgentList({ locale, staleAgents, setMarketAgents });
  agentListRequests.set(locale, request);
  return settleAgentRequest({ locale, request, staleAgents });
};

export const clearAgentsCache = (): void => {
  const { setMarketAgents } = useSettingsStore.getState();
  setMarketAgents([]);
  logDevInfo("Agents cache cleared");
};

export const getAgentDetail = async (
  identifier: string,
  requestedLocale: string = "en",
): Promise<any> => {
  const locale = normalizeAgentMarketLocale(requestedLocale);
  try {
    const response = await signedApiFetch(
      `/api/agents/${encodeURIComponent(identifier)}?locale=${locale}`,
    );
    if (!response.ok) throw new Error("Failed to fetch agent details");
    const data = await readJsonResponseOrThrow(
      response,
      "Failed to fetch agent details",
    );
    const agent = normalizeAgentDetail(data, identifier);
    if (!agent) throw new Error("Invalid agent detail response");
    return agent;
  } catch (error) {
    logDevError(`Error fetching detail for ${identifier}:`, error);
    throw error;
  }
};

export const getRandomAgents = (
  agents: LobeAgent[],
  count: number = DEFAULT_RANDOM_AGENT_COUNT,
): LobeAgent[] => {
  if (!agents || agents.length === 0) return [];
  const shuffled = [...agents].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};
