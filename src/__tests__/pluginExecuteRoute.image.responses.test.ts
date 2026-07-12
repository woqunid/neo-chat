import { describe, expect, it } from "vitest";
import {
  createPluginExecuteRequest as createRequest,
  decryptOptionalSecretMock,
  pluginAuthSecret as secret,
  safeFetchTextMock,
  setupPluginExecuteRouteTests,
} from "./helpers/pluginExecuteRoute";

setupPluginExecuteRouteTests();

describe("plugin execute route: OpenAI Responses images", () => {
  it("executes OpenAI image generation through Responses", async () => {
    decryptOptionalSecretMock.mockResolvedValue("openai-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        output: [
          {
            type: "image_generation_call",
            id: "ig_1",
            result: "openai-image",
            revised_prompt: "A revised prompt",
          },
        ],
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "openai-responses-image-processing",
        functionName: "generate_image_with_responses",
        args: {
          prompt: "A quiet dashboard",
          model: "gpt-5.5",
          image_model: "gpt-image-1.5",
          action: "generate",
          quality: "high",
          size: "1536x1024",
          n: 4,
        },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
          baseUrl: "https://openai-proxy.example/api",
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://openai-proxy.example/api/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer openai-secret",
        }),
      }),
      expect.any(Object),
    );
    expect(
      JSON.parse(safeFetchTextMock.mock.calls.at(-1)?.[1]?.body as string),
    ).toEqual({
      model: "gpt-5.5",
      input: "A quiet dashboard",
      tools: [
        {
          type: "image_generation",
          model: "gpt-image-1.5",
          action: "generate",
          quality: "high",
          size: "1536x1024",
        },
      ],
    });
    expect(safeFetchTextMock.mock.calls.at(-1)?.[1]?.body).not.toContain('"n"');
    expect(await response.json()).toMatchObject({
      result: {
        imageBase64: "openai-image",
        revisedPrompt: "A revised prompt",
      },
    });
  });

  it("uses configured OpenAI Responses image model defaults", async () => {
    decryptOptionalSecretMock.mockResolvedValue("openai-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        output: [
          {
            type: "image_generation_call",
            id: "ig_1",
            result: "openai-image",
          },
        ],
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "openai-responses-image-processing",
        functionName: "generate_image_with_responses",
        args: {
          prompt: "A quiet dashboard",
          action: "generate",
        },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
          model: "gpt-image-custom",
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(
      JSON.parse(safeFetchTextMock.mock.calls.at(-1)?.[1]?.body as string),
    ).toEqual({
      model: "gpt-5.5",
      input: "A quiet dashboard",
      tools: [
        {
          type: "image_generation",
          model: "gpt-image-custom",
          action: "generate",
        },
      ],
    });
  });

  it("does not expose Responses image processing through the compatible OpenAI plugin", async () => {
    decryptOptionalSecretMock.mockResolvedValue("openai-secret");

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "openai-image-generation",
        functionName: "generate_image_with_responses",
        args: {
          prompt: "A quiet dashboard",
        },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
        },
      }) as any,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Plugin function is not declared by this plugin",
    });
    expect(safeFetchTextMock).not.toHaveBeenCalled();
  });

  it("executes OpenAI Responses image edits with input images", async () => {
    decryptOptionalSecretMock.mockResolvedValue("openai-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        output: [
          {
            type: "image_generation_call",
            id: "ig_edit",
            result: "edited-openai-image",
          },
        ],
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "openai-responses-image-processing",
        functionName: "generate_image_with_responses",
        args: {
          prompt: "Edit this image",
          action: "edit",
          image: ["data:image/png;base64,aW1hZ2U="],
        },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(
      JSON.parse(safeFetchTextMock.mock.calls.at(-1)?.[1]?.body as string),
    ).toEqual({
      model: "gpt-5.5",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Edit this image" },
            {
              type: "input_image",
              image_url: "data:image/png;base64,aW1hZ2U=",
            },
          ],
        },
      ],
      tools: [
        {
          type: "image_generation",
          action: "edit",
        },
      ],
    });
    expect(await response.json()).toMatchObject({
      result: {
        imageBase64: "edited-openai-image",
      },
    });
  });
});
