import { describe, expect, it } from "vitest";
import {
  getApiRateLimitPolicy,
  isApiProofProtectedRoute,
} from "../lib/security/apiRoutePolicy";

describe("fork API route policy", () => {
  it("protects and limits Grok search without restoring the old search API", () => {
    expect(isApiProofProtectedRoute("/api/grok-search", "POST")).toBe(true);
    expect(getApiRateLimitPolicy("/api/grok-search", "POST")).toMatchObject({
      routeFamily: "/api/grok-search",
      maxRequests: 30,
    });
    expect(isApiProofProtectedRoute("/api/search", "POST")).toBe(false);
  });

  it("keeps superadmin rate limiting separate from request proof", () => {
    expect(isApiProofProtectedRoute("/api/superadmin/providers", "PUT")).toBe(
      false,
    );
    expect(
      getApiRateLimitPolicy("/api/superadmin/grok-search", "PUT"),
    ).toMatchObject({ routeFamily: "/api/superadmin", maxRequests: 30 });
  });

  it("uses the fork methods for models and MCP server discovery", () => {
    expect(isApiProofProtectedRoute("/api/providers/models", "GET")).toBe(true);
    expect(isApiProofProtectedRoute("/api/providers/models", "POST")).toBe(
      true,
    );
    expect(isApiProofProtectedRoute("/api/mcp/servers", "GET")).toBe(true);
    expect(getApiRateLimitPolicy("/api/mcp/servers", "GET")).toMatchObject({
      routeFamily: "/api/mcp/servers",
      maxRequests: 30,
    });
  });

  it("shares one stable family across dynamic agent paths", () => {
    const first = getApiRateLimitPolicy("/api/agents/a", "GET");
    const second = getApiRateLimitPolicy("/api/agents/b", "GET");

    expect(first?.routeFamily).toBe("/api/agents");
    expect(second?.routeFamily).toBe("/api/agents");
  });
});
