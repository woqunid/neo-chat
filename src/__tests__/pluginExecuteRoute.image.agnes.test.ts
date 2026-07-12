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

const generationResult = {
  created: 1780000000,
  data: [
    {
      url: "https://storage.example/image.png",
      b64_json: null,
      revised_prompt: null,
    },
  ],
};

describe("plugin execute route: Agnes images", () => {
  it("normalizes Agnes image generation results", async () => {
    decryptOptionalSecretMock.mockResolvedValue("agnes-secret");
    mockPluginJsonResponse(generationResult);

    const response = await executePluginRequest({
      pluginId: "agnes-image-generation",
      functionName: "generate_image",
      args: {
        prompt: "A compact glass cube",
        size: "1024x768",
      },
      authConfig: {
        type: "bearer",
        valueSecret: secret,
        model: "agnes-custom-image-model",
      },
    });

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://apihub.agnes-ai.com/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer agnes-secret",
        }),
      }),
      expect.objectContaining({ timeoutMs: 120_000 }),
    );
    expect(readLastPluginRequestBody()).toEqual({
      model: "agnes-custom-image-model",
      prompt: "A compact glass cube",
      size: "1024x768",
    });
    expect(await response.json()).toEqual({
      result: {
        imageUrl: "https://storage.example/image.png",
        imageBase64: null,
        revisedPrompt: null,
        raw: generationResult,
      },
    });
  });
});

describe("plugin execute route: Agnes images", () => {
  it("executes Agnes image editing with extra_body image inputs", async () => {
    decryptOptionalSecretMock.mockResolvedValue("agnes-secret");
    mockPluginJsonResponse({
      created: 1780000000,
      data: [
        {
          url: null,
          b64_json: "edited-image",
          revised_prompt: null,
        },
      ],
    });

    const response = await executePluginRequest({
      pluginId: "agnes-image-generation",
      functionName: "generate_image",
      args: {
        prompt: "Make the object orange",
        size: "1024x768",
        image: ["https://example.com/input.png"],
        response_format: "b64_json",
      },
      authConfig: {
        type: "bearer",
        valueSecret: secret,
      },
    });

    expect(response.status).toBe(200);
    expect(readLastPluginRequestBody()).toEqual({
      model: "agnes-image-2.1-flash",
      prompt: "Make the object orange",
      size: "1024x768",
      extra_body: {
        image: ["https://example.com/input.png"],
        response_format: "b64_json",
      },
    });
    expect(await response.json()).toMatchObject({
      result: {
        imageBase64: "edited-image",
      },
    });
  });
});
