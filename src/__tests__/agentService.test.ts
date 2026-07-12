import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createJsonResponse,
  createProofSessionResponse,
  expectSignedAgentRequest,
  makeAgent,
  mockProofAwareFetch,
} from "./helpers/agentService";

const storeState = vi.hoisted(() => ({
  value: {
    marketAgents: [] as any[],
    marketAgentsTimestamp: 0,
    marketAgentsLocale: "",
    setMarketAgents: vi.fn(),
  },
}));

vi.mock("@/store/core/settingsStore", () => ({
  useSettingsStore: {
    getState: vi.fn(() => storeState.value),
  },
}));

afterEach(() => {
  storeState.value = {
    marketAgents: [],
    marketAgentsTimestamp: 0,
    marketAgentsLocale: "",
    setMarketAgents: vi.fn(),
  };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("agent service cache", () => {
  it("uses cached agents for 72 hours", async () => {
    const now = Date.UTC(2026, 0, 1);
    vi.spyOn(Date, "now").mockReturnValue(now);
    const cachedAgent = makeAgent("agent-1", "Cached");
    storeState.value = {
      marketAgents: [cachedAgent],
      marketAgentsTimestamp: now - 72 * 60 * 60 * 1000 + 1,
      marketAgentsLocale: "en",
      setMarketAgents: vi.fn(),
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network should not be used"));
    const { getAgents } = await import("../services/api/agentService");

    await expect(getAgents()).resolves.toEqual([cachedAgent]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes agents after the 72 hour cache window", async () => {
    const now = Date.UTC(2026, 0, 1);
    vi.spyOn(Date, "now").mockReturnValue(now);
    const setMarketAgents = vi.fn();
    storeState.value = {
      marketAgents: [makeAgent("stale", "Stale")],
      marketAgentsTimestamp: now - 72 * 60 * 60 * 1000 - 1,
      marketAgentsLocale: "en",
      setMarketAgents,
    };
    const freshAgent = makeAgent("fresh", "Fresh");
    const fetchMock = mockProofAwareFetch(() => ({ agents: [freshAgent] }));
    const { getAgents } = await import("../services/api/agentService");

    await expect(getAgents()).resolves.toEqual([freshAgent]);
    expectSignedAgentRequest(fetchMock, "/api/agents?locale=en");
    expect(setMarketAgents).toHaveBeenCalledWith([freshAgent], "en");
  });
});

describe("agent service locale cache", () => {
  it("does not reuse cached agents from a different locale", async () => {
    const now = Date.UTC(2026, 0, 1);
    vi.spyOn(Date, "now").mockReturnValue(now);
    const cachedAgent = makeAgent("cached-en", "Cached English");
    const zhAgent = makeAgent("fresh-zh", "中文助理");
    const setMarketAgents = vi.fn();
    storeState.value = {
      marketAgents: [cachedAgent],
      marketAgentsTimestamp: now - 1,
      marketAgentsLocale: "en",
      setMarketAgents,
    };
    const fetchMock = mockProofAwareFetch(() => ({ agents: [zhAgent] }));
    const { getAgents } = await import("../services/api/agentService");

    await expect(getAgents(false, "zh")).resolves.toEqual([zhAgent]);
    expectSignedAgentRequest(fetchMock, "/api/agents?locale=zh");
    expect(setMarketAgents).toHaveBeenCalledWith([zhAgent], "zh");
  });

  it("normalizes Japanese agent requests and cache locale", async () => {
    const now = Date.UTC(2026, 0, 1);
    vi.spyOn(Date, "now").mockReturnValue(now);
    const jaAgent = makeAgent("fresh-ja", "日本語アシスタント");
    const setMarketAgents = vi.fn();
    storeState.value = {
      marketAgents: [],
      marketAgentsTimestamp: 0,
      marketAgentsLocale: "",
      setMarketAgents,
    };
    const fetchMock = mockProofAwareFetch(() => ({ agents: [jaAgent] }));
    const { getAgents } = await import("../services/api/agentService");

    await expect(getAgents(false, "ja-JP")).resolves.toEqual([jaAgent]);
    expectSignedAgentRequest(fetchMock, "/api/agents?locale=ja");
    expect(setMarketAgents).toHaveBeenCalledWith([jaAgent], "ja");
  });
});

describe("agent service stale cache", () => {
  it("uses stale cache without overwriting it when the agent registry is unavailable", async () => {
    const now = Date.UTC(2026, 0, 1);
    vi.spyOn(Date, "now").mockReturnValue(now);
    const staleAgent = makeAgent("stale", "Stale");
    const setMarketAgents = vi.fn();
    storeState.value = {
      marketAgents: [staleAgent],
      marketAgentsTimestamp: now - 72 * 60 * 60 * 1000 - 1,
      marketAgentsLocale: "en",
      setMarketAgents,
    };
    const fetchMock = mockProofAwareFetch(() => ({
      agents: [],
      unavailable: true,
    }));
    const { getAgents } = await import("../services/api/agentService");

    await expect(getAgents()).resolves.toEqual([staleAgent]);
    expectSignedAgentRequest(fetchMock, "/api/agents?locale=en");
    expect(setMarketAgents).not.toHaveBeenCalled();
  });
});

describe("agent service request deduplication", () => {
  it("reuses an in-flight agent list request", async () => {
    const freshAgent = makeAgent("fresh", "Fresh");
    const setMarketAgents = vi.fn();
    storeState.value = {
      marketAgents: [],
      marketAgentsTimestamp: 0,
      marketAgentsLocale: "",
      setMarketAgents,
    };
    let resolveFetch!: (response: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((input) =>
        String(input) === "/api/request-proof/session"
          ? Promise.resolve(createProofSessionResponse())
          : fetchPromise,
      );
    const { getAgents } = await import("../services/api/agentService");

    const firstRequest = getAgents();
    const secondRequest = getAgents();
    resolveFetch(createJsonResponse({ agents: [freshAgent] }));

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      [freshAgent],
      [freshAgent],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expectSignedAgentRequest(fetchMock, "/api/agents?locale=en");
    expect(setMarketAgents).toHaveBeenCalledTimes(1);
  });
});

describe("agent service locale concurrency", () => {
  it("keeps in-flight agent list requests separated by locale", async () => {
    const setMarketAgents = vi.fn();
    storeState.value = {
      marketAgents: [],
      marketAgentsTimestamp: 0,
      marketAgentsLocale: "",
      setMarketAgents,
    };
    const fetchMock = mockProofAwareFetch((url) => ({
      agents: [
        {
          identifier: String(url).includes("locale=zh")
            ? "zh"
            : String(url).includes("locale=ja")
              ? "ja"
              : "en",
          meta: { title: String(url) },
        },
      ],
    }));
    const { getAgents } = await import("../services/api/agentService");

    await expect(
      Promise.all([
        getAgents(false, "en"),
        getAgents(false, "zh"),
        getAgents(false, "ja"),
      ]),
    ).resolves.toEqual([
      [expect.objectContaining({ identifier: "en" })],
      [expect.objectContaining({ identifier: "zh" })],
      [expect.objectContaining({ identifier: "ja" })],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expectSignedAgentRequest(fetchMock, "/api/agents?locale=en");
    expectSignedAgentRequest(fetchMock, "/api/agents?locale=zh");
    expectSignedAgentRequest(fetchMock, "/api/agents?locale=ja");
  });
});

describe("agent service details", () => {
  it("encodes agent detail identifiers before building the local API path", async () => {
    const fetchMock = mockProofAwareFetch(() => ({
      identifier: "team/agent?x=1",
    }));
    const { getAgentDetail } = await import("../services/api/agentService");

    await expect(getAgentDetail("team/agent?x=1")).rejects.toThrow(
      "Invalid agent detail response",
    );

    expectSignedAgentRequest(
      fetchMock,
      "/api/agents/team%2Fagent%3Fx%3D1?locale=en",
    );
  });

  it("passes the requested locale when fetching agent details", async () => {
    const fetchMock = mockProofAwareFetch(() => ({ identifier: "agent-1" }));
    const { getAgentDetail } = await import("../services/api/agentService");

    await getAgentDetail("agent-1", "ja-JP");

    expectSignedAgentRequest(fetchMock, "/api/agents/agent-1?locale=ja");
  });

  it("normalizes agent detail responses at the client boundary", async () => {
    const fetchMock = mockProofAwareFetch(() => ({
      identifier: "different",
      meta: { title: " Detail " },
      config: { systemRole: "Role" },
    }));
    const { getAgentDetail } = await import("../services/api/agentService");

    await expect(getAgentDetail("agent-1")).resolves.toMatchObject({
      identifier: "agent-1",
      meta: { title: "Detail", systemRole: "Role" },
      config: { systemRole: "Role" },
    });
    expectSignedAgentRequest(fetchMock, "/api/agents/agent-1?locale=en");
  });
});
