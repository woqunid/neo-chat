import { describe, expect, it } from "vitest";
import {
  createPluginExecuteRequest as createRequest,
  decryptOptionalSecretMock,
  pluginAuthSecret as secret,
  safeFetchTextMock,
  setupPluginExecuteRouteTests,
} from "./helpers/pluginExecuteRoute";

setupPluginExecuteRouteTests();

describe("plugin execute route: Agnes video states", () => {
  it("normalizes Agnes video tasks that are still generating", async () => {
    decryptOptionalSecretMock.mockResolvedValue("agnes-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        id: "task_2",
        video_id: "video_2",
        status: "in_progress",
        progress: 42,
        error: null,
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "agnes-video-generation",
        functionName: "get_video_result",
        args: { video_id: "video_2" },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: {
        taskId: "task_2",
        videoId: "video_2",
        status: "in_progress",
        generationStatus: "generating",
        progress: 42,
        videoUrl: null,
        error: null,
      },
    });
  });

  it("normalizes failed Agnes video tasks without turning them into transport errors", async () => {
    decryptOptionalSecretMock.mockResolvedValue("agnes-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        id: "task_3",
        video_id: "video_3",
        status: "failed",
        progress: 75,
        error: "Generation failed upstream",
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "agnes-video-generation",
        functionName: "get_video_result",
        args: { video_id: "video_3" },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: {
        taskId: "task_3",
        videoId: "video_3",
        status: "failed",
        generationStatus: "failed",
        error: "Generation failed upstream",
      },
    });
  });

  it("retrieves legacy Agnes video results by task id", async () => {
    decryptOptionalSecretMock.mockResolvedValue("agnes-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        id: "task_legacy",
        status: "queued",
        progress: 0,
        error: null,
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "agnes-video-generation",
        functionName: "get_video_result",
        args: { task_id: "task_legacy" },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
          model: "agnes-video-custom",
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://apihub.agnes-ai.com/v1/videos/task_legacy",
      expect.objectContaining({ method: "GET" }),
      expect.any(Object),
    );
    expect(await response.json()).toMatchObject({
      result: {
        taskId: "task_legacy",
        status: "queued",
        generationStatus: "generating",
      },
    });
  });

  it("rejects Agnes video result lookups without a video id or task id", async () => {
    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "agnes-video-generation",
        functionName: "get_video_result",
        args: {},
      }) as any,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Agnes video result lookup requires video_id or task_id",
    });
    expect(safeFetchTextMock).not.toHaveBeenCalled();
  });
});
