import { expect, type MockInstance, vi } from "vitest";

const API_PROOF_SESSION_PATH = "/api/request-proof/session";
const API_PROOF_CLIENT_KEY = "dGVzdC1jbGllbnQtcHJvb2Yta2V5";
const API_PROOF_TTL_MS = 600_000;

export function makeAgent(identifier: string, title = identifier) {
  return {
    identifier,
    meta: {
      avatar: "bot",
      title,
      description: `${title} agent`,
      tags: [],
      category: "General",
    },
    createdAt: "",
    homepage: "",
    author: "",
  };
}

export function createJsonResponse(data: unknown): Response {
  return Response.json(data, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export function createProofSessionResponse(): Response {
  return createJsonResponse({
    enabled: true,
    clientKey: API_PROOF_CLIENT_KEY,
    expiresAt: Date.now() + API_PROOF_TTL_MS,
    serverTime: Date.now(),
  });
}

export function mockProofAwareFetch(
  getPayload: (input: RequestInfo | URL) => unknown,
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (String(input) === API_PROOF_SESSION_PATH) {
      return createProofSessionResponse();
    }
    return createJsonResponse(getPayload(input));
  });
}

export function expectSignedAgentRequest(
  fetchMock: MockInstance<typeof fetch>,
  path: string,
): void {
  expect(fetchMock).toHaveBeenCalledWith(
    path,
    expect.objectContaining({ headers: expect.any(Headers) }),
  );
  const call = fetchMock.mock.calls.find(([input]) => String(input) === path);
  const headers = new Headers(call?.[1]?.headers);
  expect(headers.get("x-neo-api-proof-timestamp")).toBeTruthy();
  expect(headers.get("x-neo-api-proof-nonce")).toBeTruthy();
  expect(headers.get("x-neo-api-proof-signature")).toBeTruthy();
}
