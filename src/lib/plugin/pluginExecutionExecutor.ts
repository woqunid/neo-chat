import { NextResponse } from "next/server";
import { BYOK_CONTEXTS } from "../byok/shared";
import { decryptOptionalSecret } from "../byok/server";
import { safeFetchText } from "../security/safeFetch";
import { getSafeUrlPolicy } from "../security/urlPolicy";
import type { Plugin, PluginFunction } from "../../types";
import { isPluginAuthRequired } from "./config";
import { preparePluginAuthentication } from "./pluginExecutionAuth";
import {
  preparePluginRequest,
  type PreparedPluginRequest,
} from "./pluginExecutionPreparation";
import {
  AGNES_IMAGE_PLUGIN_ID,
  AGNES_VIDEO_PLUGIN_ID,
  GEMINI_IMAGE_PLUGIN_ID,
  OPENAI_IMAGE_PLUGIN_ID,
  OPENAI_RESPONSES_IMAGE_PLUGIN_ID,
  normalizePluginResponse,
} from "./responseNormalizers";
import type { PluginAuthConfig } from "./pluginExecutionTypes";

export type { PluginAuthConfig } from "./pluginExecutionTypes";

type DecryptOptionalSecret = typeof decryptOptionalSecret;
type SafeFetchText = typeof safeFetchText;

export interface ExecutePluginFunctionRequestOptions {
  readonly plugin: Plugin;
  readonly functionDef: PluginFunction;
  readonly args: Record<string, unknown>;
  readonly authConfig?: PluginAuthConfig;
  readonly decryptSecret?: DecryptOptionalSecret;
  readonly fetchText?: SafeFetchText;
  readonly signal?: AbortSignal;
}

interface SendPluginRequestInput {
  readonly plugin: Plugin;
  readonly request: PreparedPluginRequest;
  readonly authConfig?: PluginAuthConfig;
  readonly authValue?: string;
  readonly fetchText: SafeFetchText;
  readonly signal?: AbortSignal;
}

const MEDIA_PLUGIN_TIMEOUT_MS = 120_000;
const DEFAULT_PLUGIN_TIMEOUT_MS = 30_000;
const LARGE_PLUGIN_RESPONSE_BYTES = 36 * 1024 * 1024;
const DEFAULT_PLUGIN_RESPONSE_BYTES = 2 * 1024 * 1024;
const JINA_READER_PLUGIN_ID = "jina-web-reader";
const UNSPLASH_PLUGIN_ID = "unsplash";
const MEDIA_PLUGIN_IDS: readonly string[] = [
  AGNES_IMAGE_PLUGIN_ID,
  AGNES_VIDEO_PLUGIN_ID,
  GEMINI_IMAGE_PLUGIN_ID,
  OPENAI_IMAGE_PLUGIN_ID,
  OPENAI_RESPONSES_IMAGE_PLUGIN_ID,
];
const LARGE_RESPONSE_PLUGIN_IDS: readonly string[] = [
  AGNES_IMAGE_PLUGIN_ID,
  GEMINI_IMAGE_PLUGIN_ID,
  OPENAI_IMAGE_PLUGIN_ID,
  OPENAI_RESPONSES_IMAGE_PLUGIN_ID,
];

function createRequestHeaders(
  plugin: Plugin,
  usesFormDataBody: boolean,
): Record<string, string> {
  const headers: Record<string, string> = usesFormDataBody
    ? {}
    : { "Content-Type": "application/json" };
  return plugin.id === JINA_READER_PLUGIN_ID
    ? { ...headers, Accept: "application/json" }
    : headers;
}

function getRequestBody(request: PreparedPluginRequest): BodyInit | undefined {
  if (request.method === "GET") return undefined;
  return request.requestBody ?? JSON.stringify(request.outboundArgs);
}

function getFetchLimits(pluginId: string) {
  return {
    timeoutMs: MEDIA_PLUGIN_IDS.includes(pluginId)
      ? MEDIA_PLUGIN_TIMEOUT_MS
      : DEFAULT_PLUGIN_TIMEOUT_MS,
    maxResponseBytes: LARGE_RESPONSE_PLUGIN_IDS.includes(pluginId)
      ? LARGE_PLUGIN_RESPONSE_BYTES
      : DEFAULT_PLUGIN_RESPONSE_BYTES,
  };
}

function parsePluginResponse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function sendPluginRequest(
  input: SendPluginRequestInput,
): Promise<NextResponse> {
  const authentication = preparePluginAuthentication({
    plugin: input.plugin,
    authConfig: input.authConfig,
    authValue: input.authValue,
    method: input.request.method,
    headers: createRequestHeaders(input.plugin, input.request.usesFormDataBody),
    url: input.request.url,
    outboundArgs: input.request.outboundArgs,
  });
  if ("error" in authentication) {
    return NextResponse.json({ error: authentication.error }, { status: 400 });
  }

  const request = {
    ...input.request,
    outboundArgs: authentication.outboundArgs,
  };
  const { response, text } = await input.fetchText(
    authentication.url.toString(),
    {
      method: request.method,
      headers: authentication.headers,
      body: getRequestBody(request),
      signal: input.signal,
    },
    {
      policy: getSafeUrlPolicy("plugin"),
      ...getFetchLimits(input.plugin.id),
    },
  );
  if (!response.ok) {
    return NextResponse.json(
      {
        error: `Plugin request failed with status ${response.status}`,
        status: response.status,
      },
      { status: 502 },
    );
  }
  const responseData = parsePluginResponse(text);
  return NextResponse.json({
    result: normalizePluginResponse(input.plugin, responseData),
  });
}

export async function executePluginFunctionRequest(
  options: ExecutePluginFunctionRequestOptions,
): Promise<NextResponse> {
  const prepared = preparePluginRequest({
    plugin: options.plugin,
    functionDef: options.functionDef,
    args: options.args,
    authConfig: options.authConfig,
  });
  if ("error" in prepared) {
    return NextResponse.json({ error: prepared.error }, { status: 400 });
  }

  const decryptSecret = options.decryptSecret ?? decryptOptionalSecret;
  const authValue = await decryptSecret(
    options.authConfig?.valueSecret,
    BYOK_CONTEXTS.pluginAuth(options.plugin.id),
  );
  const missingRequiredAuth =
    isPluginAuthRequired(options.plugin) &&
    options.plugin.id !== UNSPLASH_PLUGIN_ID &&
    !authValue;
  if (missingRequiredAuth) {
    return NextResponse.json(
      { error: "Plugin authentication is required" },
      { status: 400 },
    );
  }
  return sendPluginRequest({
    plugin: options.plugin,
    request: prepared.request,
    authConfig: options.authConfig,
    authValue,
    fetchText: options.fetchText ?? safeFetchText,
    signal: options.signal,
  });
}
