import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProviderTimeoutSignal,
  getChatProviderTimeoutMs,
  getGrokSearchTimeoutMs,
} from "../lib/providers/requestTimeout";

describe("provider request timeouts", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("uses independent defaults for chat generation and Grok search", () => {
    vi.stubEnv("CHAT_PROVIDER_TIMEOUT_MS", "");
    vi.stubEnv("GROK_SEARCH_TIMEOUT_MS", "");

    expect(getChatProviderTimeoutMs()).toBe(120_000);
    expect(getGrokSearchTimeoutMs()).toBe(60_000);
  });

  it("reads the two timeout values independently", () => {
    vi.stubEnv("CHAT_PROVIDER_TIMEOUT_MS", "180000");
    vi.stubEnv("GROK_SEARCH_TIMEOUT_MS", "45000");

    expect(getChatProviderTimeoutMs()).toBe(180_000);
    expect(getGrokSearchTimeoutMs()).toBe(45_000);
  });

  it("supports explicit timeout disabling per stage", () => {
    vi.stubEnv("CHAT_PROVIDER_TIMEOUT_MS", "0");
    vi.stubEnv("GROK_SEARCH_TIMEOUT_MS", "60000");

    expect(getChatProviderTimeoutMs()).toBe(0);
    expect(getGrokSearchTimeoutMs()).toBe(60_000);
  });

  it("clamps configured values to the supported range", () => {
    vi.stubEnv("CHAT_PROVIDER_TIMEOUT_MS", "500");
    vi.stubEnv("GROK_SEARCH_TIMEOUT_MS", "900000");

    expect(getChatProviderTimeoutMs()).toBe(1_000);
    expect(getGrokSearchTimeoutMs()).toBe(600_000);
  });

  it("aborts a provider stream when its timeout elapses", () => {
    vi.useFakeTimers();
    const signal = createProviderTimeoutSignal(1_000);

    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(signal.aborted).toBe(true);
  });
});
