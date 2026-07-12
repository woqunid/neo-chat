import type { Plugin, PluginFunction } from "../../types";
import {
  getSafeUrlPolicy,
  normalizeProviderBaseUrl,
  validateOutboundUrl,
} from "../security/urlPolicy";
import {
  AGNES_VIDEO_RESULT_FUNCTION,
  getAgnesVideoCreateError,
  prepareAgnesVideoResult,
  prepareOutboundArgs,
} from "./pluginExecutionAgnes";
import { prepareImageRequest } from "./pluginExecutionImages";
import {
  getPluginFunctionDefinitionError,
  getPluginFunctionPathError,
} from "./manifest";
import {
  AGNES_VIDEO_PLUGIN_ID,
  GEMINI_IMAGE_PLUGIN_ID,
  OPENAI_IMAGE_PLUGIN_ID,
  OPENAI_RESPONSES_IMAGE_PLUGIN_ID,
} from "./responseNormalizers";
import type {
  PluginAuthConfig,
  PluginHttpMethod,
} from "./pluginExecutionTypes";
import { getTrimmedStringArg, joinPluginUrl } from "./pluginExecutionUtils";

interface PluginPreparationInput {
  readonly plugin: Plugin;
  readonly functionDef: PluginFunction;
  readonly args: Readonly<Record<string, unknown>>;
  readonly authConfig?: PluginAuthConfig;
}

export interface PreparedPluginRequest {
  readonly method: PluginHttpMethod;
  readonly url: URL;
  readonly outboundArgs: Record<string, unknown>;
  readonly requestBody?: BodyInit;
  readonly usesFormDataBody: boolean;
}

export type PluginPreparationResult =
  { readonly error: string } | { readonly request: PreparedPluginRequest };

interface PathPreparation {
  readonly path: string;
  readonly outboundArgs: Record<string, unknown>;
  readonly consumedArgs: ReadonlySet<string>;
}

const SUPPORTED_METHODS: readonly PluginHttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
];
const JINA_READER_PLUGIN_ID = "jina-web-reader";

function getValidatedMethod(
  plugin: Plugin,
  functionDef: PluginFunction,
): PluginHttpMethod | string {
  if (!plugin.baseUrl) return "Plugin base URL is missing";

  const definitionError = getPluginFunctionDefinitionError(plugin, functionDef);
  if (definitionError) return definitionError;
  const pathError = getPluginFunctionPathError(functionDef);
  if (pathError) return pathError;
  if (!functionDef.method || !functionDef.path) {
    return "Plugin function path or method is missing";
  }

  const method = functionDef.method.toUpperCase();
  return SUPPORTED_METHODS.includes(method as PluginHttpMethod)
    ? (method as PluginHttpMethod)
    : `Plugin method ${method} is not supported`;
}

function getNestedTargetError(
  plugin: Plugin,
  functionDef: PluginFunction,
  args: Record<string, unknown>,
): string | null {
  if (plugin.id === JINA_READER_PLUGIN_ID) {
    const targetUrl = getTrimmedStringArg(args, "url");
    if (!targetUrl) return null;
    try {
      validateOutboundUrl(targetUrl, getSafeUrlPolicy("plugin"));
    } catch {
      return "Jina reader URL is not allowed";
    }
  }
  const isVideoCreate =
    plugin.id === AGNES_VIDEO_PLUGIN_ID && functionDef.name === "create_video";
  return isVideoCreate ? getAgnesVideoCreateError(args) : null;
}

function getProviderType(pluginId: string): string | null {
  if (pluginId === GEMINI_IMAGE_PLUGIN_ID) return "Gemini";
  const isOpenAI =
    pluginId === OPENAI_IMAGE_PLUGIN_ID ||
    pluginId === OPENAI_RESPONSES_IMAGE_PLUGIN_ID;
  return isOpenAI ? "OpenAI Compatible" : null;
}

function getPluginBaseUrl(
  plugin: Plugin,
  authConfig: PluginAuthConfig | undefined,
): { readonly baseUrl: string } | { readonly error: string } {
  if (!authConfig?.baseUrl) return { baseUrl: plugin.baseUrl as string };

  const providerType = getProviderType(plugin.id);
  if (!providerType) return { baseUrl: plugin.baseUrl as string };
  try {
    validateOutboundUrl(authConfig.baseUrl, getSafeUrlPolicy("plugin"));
    return {
      baseUrl: normalizeProviderBaseUrl(authConfig.baseUrl, providerType),
    };
  } catch {
    return { error: "Plugin endpoint URL is not allowed" };
  }
}

function prepareSpecialPath(
  input: PluginPreparationInput,
  outboundArgs: Record<string, unknown>,
): PathPreparation | { readonly error: string } {
  const functionPath = input.functionDef.path as string;
  const defaultPath = functionPath.startsWith("/")
    ? functionPath
    : `/${functionPath}`;
  const isResultLookup =
    input.plugin.id === AGNES_VIDEO_PLUGIN_ID &&
    input.functionDef.name === AGNES_VIDEO_RESULT_FUNCTION;
  if (!isResultLookup) {
    return { path: defaultPath, outboundArgs, consumedArgs: new Set() };
  }

  const result = prepareAgnesVideoResult({
    outboundArgs,
    authConfig: input.authConfig,
  });
  return (
    result ?? {
      error: "Agnes video result lookup requires video_id or task_id",
    }
  );
}

function replacePathArgument(
  path: string,
  key: string,
  value: unknown,
): { readonly path: string; readonly consumed: boolean } {
  const encoded = encodeURIComponent(String(value));
  const underscored = path.replace(`{${key}}`, encoded);
  const dashedKey = key.replace(/_/g, "-");
  const dashed = underscored.replace(`{${dashedKey}}`, encoded);
  return { path: dashed, consumed: dashed !== path };
}

function interpolatePluginPath(
  preparation: PathPreparation,
): PathPreparation | { readonly error: string } {
  let path = preparation.path;
  const consumedArgs = new Set(preparation.consumedArgs);
  for (const [key, value] of Object.entries(preparation.outboundArgs)) {
    const replacement = replacePathArgument(path, key, value);
    if (replacement.consumed) consumedArgs.add(key);
    path = replacement.path;
  }
  return /{[^}/]+}/.test(path)
    ? { error: "Plugin path parameters are missing" }
    : { ...preparation, path, consumedArgs };
}

function appendQueryArgs(
  url: URL,
  args: Readonly<Record<string, unknown>>,
  consumedArgs: ReadonlySet<string>,
): URL {
  const result = new URL(url);
  for (const [key, value] of Object.entries(args)) {
    if (!consumedArgs.has(key)) result.searchParams.append(key, String(value));
  }
  return result;
}

export function preparePluginRequest(
  input: PluginPreparationInput,
): PluginPreparationResult {
  const method = getValidatedMethod(input.plugin, input.functionDef);
  if (!SUPPORTED_METHODS.includes(method as PluginHttpMethod)) {
    return { error: method };
  }
  let outboundArgs = prepareOutboundArgs(input);
  const targetError = getNestedTargetError(
    input.plugin,
    input.functionDef,
    outboundArgs,
  );
  if (targetError) return { error: targetError };

  const endpoint = getPluginBaseUrl(input.plugin, input.authConfig);
  if ("error" in endpoint) return endpoint;
  const image = prepareImageRequest({
    pluginId: input.plugin.id,
    functionName: input.functionDef.name,
    args: outboundArgs,
    authConfig: input.authConfig,
  });
  if ("error" in image) return image;

  const specialPath = prepareSpecialPath(input, outboundArgs);
  if ("error" in specialPath) return specialPath;
  outboundArgs = specialPath.outboundArgs;
  const pathPreparation = image.path
    ? { ...specialPath, path: image.path }
    : specialPath;
  const interpolated = interpolatePluginPath(pathPreparation);
  if ("error" in interpolated) return interpolated;

  const joined = new URL(joinPluginUrl(endpoint.baseUrl, interpolated.path));
  const url =
    method === "GET"
      ? appendQueryArgs(joined, outboundArgs, interpolated.consumedArgs)
      : joined;
  return {
    request: {
      method: method as PluginHttpMethod,
      url,
      outboundArgs,
      requestBody: image.requestBody,
      usesFormDataBody: image.usesFormDataBody,
    },
  };
}
