import type { Plugin, PluginFunction } from "../../types";
import { getSafeUrlPolicy, validateOutboundUrl } from "../security/urlPolicy";
import {
  AGNES_IMAGE_PLUGIN_ID,
  AGNES_VIDEO_PLUGIN_ID,
} from "./responseNormalizers";
import type { PluginAuthConfig } from "./pluginExecutionTypes";
import {
  getConfiguredModel,
  getTrimmedStringArg,
  isRecord,
} from "./pluginExecutionUtils";

export const AGNES_VIDEO_RESULT_FUNCTION = "get_video_result";
const AGNES_IMAGE_MODEL = "agnes-image-2.1-flash";
const AGNES_VIDEO_MODEL = "agnes-video-v2.0";

interface OutboundArgsInput {
  readonly plugin: Plugin;
  readonly functionDef: PluginFunction;
  readonly args: Readonly<Record<string, unknown>>;
  readonly authConfig?: PluginAuthConfig;
}

interface VideoResultInput {
  readonly outboundArgs: Readonly<Record<string, unknown>>;
  readonly authConfig?: PluginAuthConfig;
}

export interface AgnesVideoResultPreparation {
  readonly path: string;
  readonly outboundArgs: Record<string, unknown>;
  readonly consumedArgs: ReadonlySet<string>;
}

function prepareAgnesImageArgs(
  args: Readonly<Record<string, unknown>>,
  authConfig: PluginAuthConfig | undefined,
): Record<string, unknown> {
  const outbound = { ...args };
  outbound.model =
    getTrimmedStringArg(outbound, "model") ||
    getConfiguredModel(authConfig) ||
    AGNES_IMAGE_MODEL;
  const extraBody = isRecord(outbound.extra_body)
    ? { ...outbound.extra_body }
    : {};
  if (Array.isArray(outbound.image)) {
    extraBody.image = outbound.image;
    delete outbound.image;
  }
  if (typeof outbound.response_format === "string") {
    extraBody.response_format = outbound.response_format;
    delete outbound.response_format;
  }
  if (Object.keys(extraBody).length > 0) outbound.extra_body = extraBody;
  return outbound;
}

function prepareAgnesVideoArgs(
  args: Readonly<Record<string, unknown>>,
  authConfig: PluginAuthConfig | undefined,
): Record<string, unknown> {
  return {
    ...args,
    model:
      getTrimmedStringArg(args, "model") ||
      getConfiguredModel(authConfig) ||
      AGNES_VIDEO_MODEL,
  };
}

export function prepareOutboundArgs(
  input: OutboundArgsInput,
): Record<string, unknown> {
  if (input.plugin.id === AGNES_IMAGE_PLUGIN_ID) {
    return prepareAgnesImageArgs(input.args, input.authConfig);
  }
  const isVideoCreate =
    input.plugin.id === AGNES_VIDEO_PLUGIN_ID &&
    input.functionDef.name === "create_video";
  return isVideoCreate
    ? prepareAgnesVideoArgs(input.args, input.authConfig)
    : { ...input.args };
}

export function getAgnesVideoCreateError(
  args: Record<string, unknown>,
): string | null {
  const image = getTrimmedStringArg(args, "image");
  if (!image) return null;
  try {
    validateOutboundUrl(image, getSafeUrlPolicy("plugin"));
    return null;
  } catch {
    return "Agnes image-to-video currently requires a public HTTPS image URL";
  }
}

export function prepareAgnesVideoResult(
  input: VideoResultInput,
): AgnesVideoResultPreparation | null {
  const outboundArgs = { ...input.outboundArgs };
  const videoId = getTrimmedStringArg(outboundArgs, "video_id");
  if (videoId) {
    outboundArgs.video_id = videoId;
    delete outboundArgs.task_id;
    const configuredModel = getConfiguredModel(input.authConfig);
    if (!getTrimmedStringArg(outboundArgs, "model_name") && configuredModel) {
      outboundArgs.model_name = configuredModel;
    }
    return { path: "/agnesapi", outboundArgs, consumedArgs: new Set() };
  }

  const taskId = getTrimmedStringArg(outboundArgs, "task_id");
  if (!taskId) return null;
  outboundArgs.task_id = taskId;
  return {
    path: `/v1/videos/${encodeURIComponent(taskId)}`,
    outboundArgs,
    consumedArgs: new Set(["task_id"]),
  };
}
