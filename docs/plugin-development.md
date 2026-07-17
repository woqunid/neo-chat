# Plugin Development

Neo Chat plugins expose executable tools to compatible model providers. A
plugin can come from an OpenAPI manifest, a built-in definition, or a remote
streamable HTTP MCP server. Enabled plugin functions are sent to the model as
tools, and runtime tool calls execute through server routes. Plugins are
different from Skills: Skills are text-only prompt-context instructions stored
locally, while plugins and MCP servers are network-capable tools executed by
the server-side plugin route.

## Plugin Shape

Plugins use the `Plugin` and `PluginFunction` interfaces from
`src/lib/plugin/types.ts`.

Required plugin fields:

| Field         | Purpose                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `id`          | Stable plugin id used by settings, registry lookup, and tool execution. |
| `title`       | User-facing plugin name.                                                |
| `description` | User-facing summary.                                                    |
| `logoUrl`     | Logo URL shown in the plugin market.                                    |
| `manifestUrl` | URL for the source manifest or OpenAPI document.                        |
| `functions`   | Tool functions exposed by the plugin.                                   |

Optional fields include `externalDocsUrl`, `baseUrl`, `source`, `mcp`,
`category`, `categories`, `added`, `builtIn`, and `auth`. Existing OpenAPI
plugins may omit `source`; built-ins use `builtin`, imported OpenAPI plugins
use `openapi`, and MCP-backed plugins use `mcp`.

Plugin IDs must be stable. Built-in plugin IDs are reserved; a custom plugin or
manifest import cannot replace a built-in tool definition.

## Function Shape

Each function should define:

| Field         | Purpose                                                                                               |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| `name`        | Tool name. Keep it stable and model-friendly.                                                         |
| `description` | Short description sent to the model.                                                                  |
| `parameters`  | JSON-schema-like parameter object.                                                                    |
| `path`        | Relative request path for REST/OpenAPI tools. Absolute URLs and protocol-relative paths are rejected. |
| `method`      | HTTP method for REST/OpenAPI tools, usually `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`.               |
| `mcpToolName` | Original remote MCP tool name. MCP functions omit `path` and `method`.                                |
| `risk`        | Optional risk level: `read`, `write`, `destructive`, or `external`.                                   |

If risk is omitted, Neo Chat infers it from the HTTP method: `GET` maps to
`read`, `DELETE` maps to `destructive`, and other non-GET methods map to
`write`. MCP tools should use `external` because the side effects are owned by
the remote server.

## MCP Servers

MCP support is intentionally folded into the existing plugin system. Installed
MCP servers live in `installedPlugins`, enabled MCP servers live in
`activePlugins`, and credentials live in `pluginConfigs` using the same BYOK
local-secret path as OpenAPI plugins. There is no separate `activeMcpServers`
store.

当前支持官方 Registry 和用户自定义的远程 `streamable-http` MCP 服务，不会启动
本地 stdio、npm 包、Docker 容器。MCP 地址必须使用 HTTPS；本地或自托管部署可访问
局域网 HTTPS MCP 服务，托管部署默认阻止此类目标，除非显式设置
`ALLOW_LOCAL_NETWORK_PROXY=true`。OAuth 类型当前表示用户手工提供 Access Token，
尚不包含 OAuth Discovery、PKCE 登录回调和自动刷新令牌流程。

安装或刷新时，服务端通过 MCP SDK 发现 Tools、Resources、Resource Templates、
Prompts 与服务器能力，将工具转换成 `PluginFunction`，再以 upsert 方式写入服务端
注册表并返回浏览器。因此同一插件重新安装会更新能力和工具定义，不会产生重复记录。
本地工具名使用稳定格式：

```text
mcp_<server_slug>__<sanitized_tool_name>
```

Names are capped at the chat tool-schema limit and get a short hash suffix
when truncation or same-plugin collisions occur. The model sees only the local
tool name. Execution maps it back through `plugin.mcp.toolNameMap` or
`function.mcpToolName`, then calls MCP `callTool({ name, arguments })`.

MCP 结果沿用 `/api/plugins/execute` 响应结构。调用前会依据工具 `inputSchema`
校验参数；存在 `outputSchema` 时会校验 `structuredContent`。文本结果遵守统一大小
限制，image、audio、resource 和 resource_link 内容会转换为现有渲染或附件可消费的
结构，写入模型历史前会移除大体积图片正文。

状态化 Streamable HTTP 连接按聊天会话和插件隔离，空闲 90 秒后终止。客户端处理
Tools、Resources、Prompts 列表变化、资源更新、Progress 与 Logging 通知；列表变化会
触发后台能力刷新。插件详情页可以列出和读取 Resources、管理订阅、列出和获取
Prompts、请求参数补全，并配置发送给服务器的 Roots。

Registry metadata can provide static remote headers, which are stored in
`plugin.mcp.headers` and sent with MCP `listTools` and `callTool` requests.
Registry 中的密钥或必填 Header 元数据会映射到插件鉴权界面。安装前可输入 Bearer、
API Key Header/Query 或 OAuth Access Token；自定义 MCP 还可配置非敏感静态 Header。
用户凭据经过现有 BYOK 信封加密链路传输。

## Authentication

Plugin auth supports:

- `none`
- `bearer`
- `apiKey`
- `basic`
- `oauth2`

For API keys, set `name` and `in` (`header` or `query`) when the upstream API
requires a specific key location. User-entered plugin secrets are stored as
local BYOK envelopes before server routes use them.

## OpenAPI Import Constraints

OpenAPI conversion supports a bounded subset:

- The spec must be a JSON object with a `paths` object.
- A server URL or OpenAPI `host` must be present.
- Supported methods are `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`.
- Plugin paths must start with `/`, must not start with `//`, and are truncated
  to the configured path limit.
- Query and path parameters are converted into tool parameters.
- Operation names come from `operationId` when available, with unsafe
  characters converted to underscores.
- The importer caps the number of paths, parameters, and plugin functions to
  prevent oversized manifests.

## Hosted Deployment Registry

Hosted mode blocks legacy payloads where the browser submits a complete plugin
definition for execution. In hosted deployments, plugin execution must resolve
through server-registered plugin ids and function names.

Set shared registry storage for hosted or multi-instance deployments:

```bash
DEPLOYMENT_MODE=hosted
PLUGIN_REGISTRY_STORE=upstash
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

Built-in plugins are always resolvable by ID. Custom plugins should be
registered before use and stored in the shared registry for hosted or
multi-instance deployments; otherwise another instance may be unable to resolve
the function call.

Built-in media plugin IDs are reserved and protocol-specific. Agnes and Gemini
image tools are image processing plugins, `openai-image-generation` targets the
OpenAI-compatible Images API, and `openai-responses-image-processing` targets
the OpenAI Responses API. Supported built-ins can expose plugin-level API Base
URL and Model ID fields; Agnes video remains a two-step `create_video` /
`get_video_result` flow and accepts public HTTPS image URLs for image-to-video.

运行时对 `write`、`destructive`、`external` 风险工具逐次请求确认；未提供确认回调或
用户拒绝时不会执行。MCP 服务可由用户显式标记为可信，从而跳过该服务的逐次确认。
`read` 工具、内部记忆工具和 Grok 搜索不进入此确认链路。

If two active plugins expose the same function name, execution returns a
collision error instead of choosing one silently. Keep function names unique
across plugins that users are likely to enable together.

## Safety Checklist

- Keep plugin `baseUrl` and OpenAPI server URLs on trusted HTTPS origins for
  hosted deployments.
- Prefer `GET` for read-only tools and reserve mutating HTTP methods for
  actions that actually change external state.
- Mark destructive or external-side-effect functions with explicit risk
  metadata.
- Keep descriptions concise and specific so the model can choose tools
  correctly.
- Avoid function-name collisions with other built-in or commonly installed
  plugins.
- Do not log plugin secrets, provider keys, or raw private user data.

## Testing

Relevant checks:

```bash
pnpm test -- src/__tests__/pluginConfig.test.ts
pnpm test -- src/__tests__/pluginManifest.test.ts
pnpm test -- src/__tests__/pluginResolve.test.ts
pnpm test -- src/__tests__/serverPluginRegistry.test.ts
pnpm test -- src/__tests__/mcpRegistry.test.ts
pnpm test -- src/__tests__/mcpInstallRoute.test.ts
pnpm test -- src/__tests__/mcpExecuteRoute.test.ts
pnpm test -- src/__tests__/mcpCapabilitiesRoutes.test.ts
pnpm test -- src/__tests__/mcpSchemaValidation.test.ts
```

Run the full project checks before opening a pull request:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Official Registry entries use a server-side trust refresh during installation.
The install route re-fetches the versioned manifest from the allowlisted MCP
Registry host, normalizes endpoint and header metadata again, and requires the
resulting plugin ID to match the requested ID before listing tools. The browser
marketplace object is discovery input, not installation authority.
