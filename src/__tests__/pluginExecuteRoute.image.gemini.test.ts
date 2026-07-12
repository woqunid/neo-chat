import { describe, expect, it } from "vitest";
import {
  decryptOptionalSecretMock,
  executePluginRequest,
  mockPluginJsonResponse,
  pluginAuthSecret as secret,
  readLastPluginRequestBody,
  safeFetchTextMock,
  setupPluginExecuteRouteTests,
} from "./helpers/pluginExecuteRoute";

setupPluginExecuteRouteTests();

const expectedRequestBody = {
  model: "gemini-3.1-flash-image",
  input: "A compact glass cube",
  response_modalities: ["image"],
  generation_config: {
    candidate_count: 3,
    image_config: {
      aspect_ratio: "3:2",
      image_size: "2K",
    },
  },
};

describe("plugin execute route: Gemini images", () => {
  it("executes Gemini image generation through Interactions", async () => {
    decryptOptionalSecretMock.mockResolvedValue("gemini-secret");
    mockPluginJsonResponse({
      id: "interaction_1",
      output_image: {
        data: "gemini-image",
        mime_type: "image/png",
      },
    });

    const response = await executePluginRequest({
      pluginId: "gemini-image-generation",
      functionName: "generate_gemini_image",
      args: {
        prompt: "A compact glass cube",
        aspect_ratio: "3:2",
        image_size: "2K",
        n: 3,
      },
      authConfig: {
        type: "apiKey",
        valueSecret: secret,
        baseUrl: "https://gemini-proxy.example/v1beta",
      },
    });

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://gemini-proxy.example/v1beta/interactions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-goog-api-key": "gemini-secret",
        }),
      }),
      expect.any(Object),
    );
    expect(readLastPluginRequestBody()).toEqual(expectedRequestBody);
    expect(await response.json()).toMatchObject({
      result: {
        imageBase64: "gemini-image",
        imageUrl: null,
      },
    });
  });
});
