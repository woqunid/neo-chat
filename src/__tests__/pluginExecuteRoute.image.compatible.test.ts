import { describe, expect, it } from "vitest";
import {
  createPluginExecuteRequest as createRequest,
  decryptOptionalSecretMock,
  pluginAuthSecret as secret,
  safeFetchTextMock,
  setupPluginExecuteRouteTests,
} from "./helpers/pluginExecuteRoute";

setupPluginExecuteRouteTests();

describe("plugin execute route: OpenAI-compatible images", () => {
  it("executes OpenAI-compatible image generations with configured endpoint", async () => {
    decryptOptionalSecretMock.mockResolvedValue("compat-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        data: [{ url: "https://cdn.example.com/generated.png" }],
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "openai-image-generation",
        functionName: "generate_image_with_images_api",
        args: {
          prompt: "A compact glass cube",
          model: "gpt-image-2",
          size: "1024x1024",
          n: 2,
        },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
          baseUrl: "https://api.krill-ai.com/v1",
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://api.krill-ai.com/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer compat-secret",
        }),
      }),
      expect.any(Object),
    );
    expect(
      JSON.parse(safeFetchTextMock.mock.calls.at(-1)?.[1]?.body as string),
    ).toEqual({
      model: "gpt-image-2",
      prompt: "A compact glass cube",
      size: "1024x1024",
      n: 2,
    });
    expect(await response.json()).toMatchObject({
      result: {
        imageUrl: "https://cdn.example.com/generated.png",
        imageBase64: null,
      },
    });
  });

  it("uses configured OpenAI-compatible image model defaults", async () => {
    decryptOptionalSecretMock.mockResolvedValue("compat-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        data: [{ url: "https://cdn.example.com/generated.png" }],
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "openai-image-generation",
        functionName: "generate_image_with_images_api",
        args: {
          prompt: "A compact glass cube",
          size: "1024x1024",
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
      model: "gpt-image-custom",
      prompt: "A compact glass cube",
      size: "1024x1024",
    });
  });

  it("executes OpenAI-compatible image edits as multipart requests", async () => {
    decryptOptionalSecretMock.mockResolvedValue("compat-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        data: [{ b64_json: "edited-image" }],
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "openai-image-generation",
        functionName: "generate_image_with_images_api",
        args: {
          prompt: "Edit this image",
          model: "gpt-image-2",
          image: ["data:image/png;base64,aW1hZ2U="],
        },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
          baseUrl: "https://api.krill-ai.com/v1",
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://api.krill-ai.com/v1/images/edits",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer compat-secret",
        }),
        body: expect.any(FormData),
      }),
      expect.any(Object),
    );
    const formData = safeFetchTextMock.mock.calls.at(-1)?.[1]?.body as FormData;
    expect(formData.get("model")).toBe("gpt-image-2");
    expect(formData.get("prompt")).toBe("Edit this image");
    expect(formData.getAll("image")).toHaveLength(1);
    expect(await response.json()).toMatchObject({
      result: {
        imageBase64: "edited-image",
      },
    });
  });

  it("rejects unsafe OpenAI-compatible endpoint overrides", async () => {
    decryptOptionalSecretMock.mockResolvedValue("compat-secret");

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "openai-image-generation",
        functionName: "generate_image_with_images_api",
        args: {
          prompt: "A compact glass cube",
          model: "gpt-image-2",
        },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
          baseUrl: "http://localhost:11434/v1",
        },
      }) as any,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Plugin endpoint URL is not allowed",
    });
    expect(safeFetchTextMock).not.toHaveBeenCalled();
  });
});
