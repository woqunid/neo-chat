import { describe, expect, it } from "vitest";
import {
  createPluginExecuteRequest as createRequest,
  decryptOptionalSecretMock,
  pluginAuthSecret as secret,
  safeFetchTextMock,
  setupPluginExecuteRouteTests,
} from "./helpers/pluginExecuteRoute";

setupPluginExecuteRouteTests();

describe("plugin execute route: Agnes video creation", () => {
  it("creates Agnes text-to-video tasks with configured model defaults", async () => {
    decryptOptionalSecretMock.mockResolvedValue("agnes-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        id: "task_text",
        task_id: "task_text",
        video_id: "video_text",
        status: "queued",
        progress: 0,
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "agnes-video-generation",
        functionName: "create_video",
        args: {
          prompt: "A quiet cinematic beach shot",
          num_frames: 121,
          frame_rate: 24,
        },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
          model: "agnes-video-custom",
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://apihub.agnes-ai.com/v1/videos",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer agnes-secret",
        }),
      }),
      expect.objectContaining({ timeoutMs: 120_000 }),
    );
    expect(
      JSON.parse(safeFetchTextMock.mock.calls.at(-1)?.[1]?.body as string),
    ).toEqual({
      prompt: "A quiet cinematic beach shot",
      num_frames: 121,
      frame_rate: 24,
      model: "agnes-video-custom",
    });
  });

  it("creates Agnes image-to-video tasks with explicit model priority", async () => {
    decryptOptionalSecretMock.mockResolvedValue("agnes-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        id: "task_image",
        video_id: "video_image",
        status: "queued",
        progress: 0,
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "agnes-video-generation",
        functionName: "create_video",
        args: {
          prompt: "Animate the product photo",
          image: "https://example.com/product.png",
          model: "agnes-video-explicit",
        },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
          model: "agnes-video-configured",
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(
      JSON.parse(safeFetchTextMock.mock.calls.at(-1)?.[1]?.body as string),
    ).toEqual({
      prompt: "Animate the product photo",
      image: "https://example.com/product.png",
      model: "agnes-video-explicit",
    });
  });

  it("rejects non-HTTPS Agnes image-to-video inputs", async () => {
    decryptOptionalSecretMock.mockResolvedValue("agnes-secret");

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "agnes-video-generation",
        functionName: "create_video",
        args: {
          prompt: "Animate this image",
          image: "data:image/png;base64,aW1hZ2U=",
        },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
        },
      }) as any,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Agnes image-to-video currently requires a public HTTPS image URL",
    });
    expect(safeFetchTextMock).not.toHaveBeenCalled();
  });
});
