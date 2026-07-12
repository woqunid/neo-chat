import { describe, expect, it } from "vitest";
import {
  createPluginExecuteRequest as createRequest,
  decryptOptionalSecretMock,
  executePluginRequest,
  mockPluginJsonResponse,
  pluginAuthSecret as secret,
  safeFetchTextMock,
  setupPluginExecuteRouteTests,
} from "./helpers/pluginExecuteRoute";

setupPluginExecuteRouteTests();

const completedVideoResponse = {
  id: "task_1",
  task_id: "task_1",
  video_id: "video_1",
  status: "completed",
  progress: 100,
  seconds: "5.0",
  size: "1152x768",
  remixed_from_video_id: "https://storage.example/video.mp4",
  error: null,
};

describe("plugin execute route: Agnes video results", () => {
  it("normalizes Agnes video task result fields", async () => {
    decryptOptionalSecretMock.mockResolvedValue("agnes-secret");
    mockPluginJsonResponse(completedVideoResponse);

    const response = await executePluginRequest({
      pluginId: "agnes-video-generation",
      functionName: "get_video_result",
      args: { video_id: "video_1" },
      authConfig: {
        type: "bearer",
        valueSecret: secret,
      },
    });

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://apihub.agnes-ai.com/agnesapi?video_id=video_1",
      expect.objectContaining({ method: "GET" }),
      expect.any(Object),
    );
    expect(await response.json()).toEqual({
      result: {
        taskId: "task_1",
        videoId: "video_1",
        status: "completed",
        generationStatus: "generated",
        progress: 100,
        seconds: "5.0",
        size: "1152x768",
        videoUrl: "https://storage.example/video.mp4",
        error: null,
        raw: completedVideoResponse,
      },
    });
  });
});

describe("plugin execute route: Agnes video results", () => {
  it("retrieves Agnes video results with configured model name", async () => {
    decryptOptionalSecretMock.mockResolvedValue("agnes-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        id: "task_custom",
        video_id: "video_custom",
        status: "completed",
        progress: 100,
        url: "https://storage.example/custom.mp4",
        error: null,
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "agnes-video-generation",
        functionName: "get_video_result",
        args: { video_id: "video_custom" },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
          model: "agnes-video-custom",
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://apihub.agnes-ai.com/agnesapi?video_id=video_custom&model_name=agnes-video-custom",
      expect.objectContaining({ method: "GET" }),
      expect.any(Object),
    );
  });
});

describe("plugin execute route: Agnes video results", () => {
  it("prefers explicit Agnes video result model names", async () => {
    decryptOptionalSecretMock.mockResolvedValue("agnes-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        id: "task_explicit",
        video_id: "video_explicit",
        status: "completed",
        progress: 100,
        url: "https://storage.example/explicit.mp4",
        error: null,
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "agnes-video-generation",
        functionName: "get_video_result",
        args: {
          video_id: "video_explicit",
          model_name: "agnes-video-explicit",
        },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
          model: "agnes-video-configured",
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://apihub.agnes-ai.com/agnesapi?video_id=video_explicit&model_name=agnes-video-explicit",
      expect.objectContaining({ method: "GET" }),
      expect.any(Object),
    );
  });
});
