# Changelog

All notable changes to Neo Chat should be documented here.

This project does not yet follow a formal release cadence. Maintainers should
group changes under a level-2 heading that matches the release tag, such as
`## v2.0.0`; the release workflow uses that section as the GitHub release notes
when the matching tag is pushed.

## v2.2.0

- Added remote `streamable-http` MCP servers to the existing plugin system,
  including official Registry discovery, authenticated tool listing and
  execution, deterministic tool names, and server-side registry metadata
  re-fetching before installation.
- Kept the fork's administrator-managed Grok web search while integrating MCP;
  the removed upstream search-provider route and settings were not restored.
- Centralized API request-proof and rate-limit policy by route and method,
  including stable route families, signed proof-session identities, Grok and
  superadmin rules, and MCP discovery protection without a shared unknown-IP
  bucket.
- Added bounded provider transports for OpenAI, OpenAI-compatible, Google, and
  the existing hand-written Anthropic adapter. Provider streams now validate
  terminal events, propagate cancellation, and surface structured timeout,
  incomplete-stream, and response-size errors.
- Added request-time context budgeting for history, attachments, memory, and
  tool results so oversized current input fails explicitly while older context
  is bounded by model metadata.
- Fixed Docker Compose HTTP access by removing CSP's automatic insecure-request
  upgrade. Hosted CSP and outbound URL policies remain stricter than local
  self-hosted mode.
- Standardized development and CI on Node.js 22, added public-artifact hygiene
  checks, built the Cloudflare Worker in CI, and enforced a configurable
  Wrangler gzip-size budget from dry-run output.

## v2.1.0

- Rebuilt System Settings with clearer grouped controls, deployment health
  visibility, local data export/reset actions, and refreshed localized settings
  copy.
- Added native image generation and image editing for models with image
  input/output metadata, including ordered mixed text/image output blocks,
  image edit attachments, and OPFS-backed display caching.
- Expanded built-in plugin media tools: Agnes and Gemini now present as image
  processing plugins, OpenAI-compatible Images API and OpenAI Responses image
  processing are separate built-ins, and image plugin results are compacted into
  tool details/history so follow-up model messages decide how to reference them.
- Added plugin-level API Base URL and Model ID controls for supported image
  plugins, image count parameters where the upstream API supports them, Agnes
  image-to-image editing, and Agnes video image-to-video support with custom
  video model IDs while preserving the two-step `create_video` /
  `get_video_result` workflow.
- Added thinking intensity controls and provider-specific reasoning mapping for
  Gemini and OpenAI-compatible model requests.
- Added Japanese localization across the app, SEO metadata, LobeHub assistant
  locale routing, voice language handling, and the public Skills catalog.
- Hardened hosted deployments with API request proof, stronger shared-store and
  rate-limit checks, service health coverage, safer URL/secret handling, and
  expanded test coverage.
- Fixed Cloudflare Workers preview/deploy commands and kept Worker deploys from
  dropping dashboard-managed variables.
- Refined code block rendering, syntax highlighting, sandboxed HTML preview,
  Mermaid/mind map/SVG rendering behavior, and release automation based on
  matching `CHANGELOG.md` sections.
- Added a fork-only upstream sync workflow and README guidance for keeping fork
  repositories current with `u14app/neo-chat`.

## v2.0.0

- Added open-source governance files, issue templates, pull request template,
  Dependabot configuration, and documentation for environment variables,
  plugin development, and privacy/data handling.
- Added required Prettier format checking to CI after a one-time repository
  formatting pass.
- Added text-only Skills with localized public catalogs, install/uninstall,
  local edits, custom skills, auto-selection, and workspace presets.
- Expanded message rendering with safe inline HTML visual blocks, Mermaid and
  mind map fullscreen rendering, richer source blocks, and visible search
  failure states.
- Hardened hosted and multi-instance deployment behavior with shared plugin
  registry storage, document parse job secrets, deployment health checks,
  trusted proxy guidance, and safer sandbox/document parsing limits.
- Added local memory documentation and Mimo voice defaults alongside existing
  search, RAG, document parsing, and BYOK configuration guidance.
