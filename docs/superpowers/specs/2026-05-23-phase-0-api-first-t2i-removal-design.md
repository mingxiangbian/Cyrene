# Phase 0 API-first 和 T2I Removal Design

## 目标

Phase 0 的目标是把 Cyrene 从“默认依赖本地模型和本地 T2I 能力”的运行方式，收敛成更轻量的 `API-first`、`local-first` runtime。

本次设计只覆盖 Phase 0：

```txt
1. 硬删除当前 T2I 实现和本地 T2I 资产
2. 把模型配置改成 API-first 主路径
3. 新增 startup-time manual FeatureFlags
4. 让工具注册由 config 驱动
5. 新增 cyrene config doctor
6. 更新 README / .env.example / tests
```

本次不实现 Phase 1 的 model router、Phase 2 的 trace store、Phase 3 的 typed memory、Phase 4 的 affect state、Phase 5 的 eval harness、Phase 6 的 controlled evolution，或 Phase 7 的通用 capability/plugin 系统。

## 当前结构判断

当前主要启动链路是：

```txt
src/main.ts
  -> buildAgentRuntime(cwd)
       -> createDefaultConfig(cwd)
       -> memory loaders
       -> createCoreTools()
  -> runAgentLoop() / runRepl() / startWebServer()
```

当前 T2I 已经进入 core tool set：

```txt
src/tools/index.ts
  -> createCoreTools()
       -> generateImageTool
```

这导致默认 runtime 存在几个问题：

```txt
1. 模型默认能看到 generate_image
2. T2I 配置默认存在于 AppConfig
3. T2I_AUTO_START 当前默认 true
4. README 和 .env.example 会把本地 SD1.5 路径展示为可用能力
5. T2I worker、Python env、模型资产占用本地资源
```

Phase 0 会把这些路径移除，而不是把当前 T2I 改造成 optional provider。原因是用户当前用不到生图模型，未来图像生成应由 Phase 7 或之后的 capability/plugin 系统重新设计。

## T2I 删除边界

本次硬删除当前 T2I runtime 代码、测试和配置：

```txt
src/tools/generate-image.ts
scripts/t2i-worker.py
server/start-t2i.sh
requirements-t2i.txt
requirements-t2i-detail.txt
tests/generate-image-tool.test.ts
tests/t2i-worker.test.ts
tests/t2i-worker-smoke.test.ts
```

同时删除本地未跟踪 T2I 资产和环境：

```txt
/Users/phoenix/Assistant/Cyrene/T2I
/Users/phoenix/Assistant/Cyrene/.venv-t2i
```

明确不删除：

```txt
/Users/phoenix/Assistant/Cyrene/Qwen3.5-9B-MLX-4bit
```

`Qwen3.5-9B-MLX-4bit/` 是本地语言模型目录，不属于本轮 T2I 删除范围。它可以作为 optional local fallback 继续存在。

旧 T2I 设计 spec 文件保留为历史记录：

```txt
docs/superpowers/specs/2026-05-21-t2i-sd15-design.md
docs/superpowers/specs/2026-05-21-t2i-detail-enhance-design.md
docs/superpowers/specs/2026-05-22-t2i-safe-preset-dynamic-thresholding-design.md
```

这些文件不参与 runtime、test 或 README 新用户路径。

## 未来图像生成方向

Phase 0 不保留 `CYRENE_ENABLE_T2I`，也不保留 legacy `generate_image` tool。未来图像生成应作为新的 capability/plugin 重新引入。

未来插件化方向可以是：

```txt
src/capabilities/
  types.ts
  registry.ts
  image-generation/
    manifest.ts
    tool-factory.ts
    providers/
    web-panel.ts
    cli.ts
```

未来 image-generation capability 可以支持：

```txt
remote API provider
ComfyUI provider
SD WebUI provider
local model provider
```

但 Phase 0 不实现这些内容，也不让旧 T2I 代码约束未来插件设计。

## API-first 模型配置

`createDefaultConfig(cwd)` 应以 OpenAI-compatible API endpoint 为主路径。

主配置：

```env
CYRENE_BASE_URL=https://api.example.com/v1
CYRENE_MODEL=strong-model-name
CYRENE_API_KEY=...
```

Phase 0 不应在 runtime 中内置虚假的远程 API 默认值，也不应继续把本地 MLX/Qwen 作为隐式默认值。如果 `CYRENE_BASE_URL` 或 `CYRENE_MODEL` 缺失，普通 agent run 应在发起模型请求前给出清晰配置错误；`cyrene config doctor` 应能显示缺失项并给出下一步配置提示。

`CYRENE_API_KEY` 可选。若配置了 API key，`llm-client` 在请求中发送：

```txt
Authorization: Bearer <CYRENE_API_KEY>
```

本地 MLX/Qwen 仍可作为 optional fallback，但不再作为 README 里的默认推荐路径。

本地 fallback 文档示例：

```env
CYRENE_BASE_URL=http://127.0.0.1:8080/v1
CYRENE_MODEL=Qwen3.5-9B-MLX-4bit
```

`server/start.sh` 保留，因为它服务的是本地语言模型 fallback，不属于 T2I 删除范围。

## FeatureFlags 设计

新增 startup-time manual `FeatureFlags`。这些 flag 由环境变量或未来配置文件控制，不由模型自动打开或关闭。

Phase 0 的最小结构：

```ts
export interface FeatureFlags {
  bashEnabled: boolean
  webSearchEnabled: boolean
  mcpEnabled: boolean
}
```

环境变量：

```env
CYRENE_ENABLE_BASH=1
CYRENE_ENABLE_WEB_SEARCH=1
CYRENE_ENABLE_MCP=0
```

默认值：

```txt
bashEnabled: true
webSearchEnabled: true
mcpEnabled: false
```

文件工具和 `ask_user` 继续作为 core tools：

```txt
file_read
file_write
file_edit
grep
glob
ask_user
```

`bash` 和 `web_search` 受 FeatureFlags 控制。关闭时，它们不进入本轮模型请求的 `tools` schema，模型无法选择或调用这些工具。

`mcpEnabled` 在 Phase 0 中只作为预留配置和 doctor 输出项存在。当前代码没有 MCP tool registry，因此 Phase 0 不注册 MCP 工具。

Phase 0 不做 Web UI runtime 开关，不做 session-level tool toggle，不做模型自主开关工具。这些属于 Phase 7 control console 的设计范围。

## 工具注册数据流

`createCoreTools()` 改为接收 config：

```ts
export function createCoreTools(config: AppConfig): Tool<unknown>[] {
  const tools: Tool<unknown>[] = [
    fileReadTool,
    fileWriteTool,
    fileEditTool,
    grepTool,
    globTool,
    askUserTool
  ]

  if (config.features.bashEnabled) {
    tools.push(bashTool)
  }

  if (config.features.webSearchEnabled) {
    tools.push(webSearchTool)
  }

  return tools
}
```

最终启动链路：

```txt
src/main.ts
  -> buildAgentRuntime(cwd)
    -> createDefaultConfig(cwd)
    -> createCoreTools(config)
    -> runAgentLoop / runRepl / startWebServer
```

工具 schema 数据流：

```txt
FeatureFlags
  -> createCoreTools(config)
    -> toolDefinitions(tools)
      -> llm-client request body
```

这样 CLI、REPL、Web 共用同一套工具注册逻辑。

## config doctor

新增 CLI 子命令：

```bash
cyrene config doctor
```

Phase 0 的 `config doctor` 输出只做轻量检查：

```txt
Model:
  baseUrl
  model
  missing required fields
  apiKey configured / missing

Tools:
  enabled tools
  disabled tools

Local fallback:
  server/start.sh exists / missing
  local fallback is optional

T2I:
  removed from runtime
  generate_image unavailable
```

如果 `CYRENE_BASE_URL` 是远程 HTTPS URL 且未配置 `CYRENE_API_KEY`，doctor 应给出 warning，但不阻止运行。某些 OpenAI-compatible endpoint 可能通过其他方式鉴权，Phase 0 不把它判定为 fatal。

## llm-client 调整

`llm-client` 继续调用 OpenAI-compatible `/chat/completions`。

本次应加入：

```txt
CYRENE_API_KEY -> Authorization header
```

本次可以移除通用 request body 中的模型特定字段：

```txt
chat_template_kwargs
```

原因是它是本地 Qwen/MLX 特定字段，不应该污染通用 OpenAI-compatible API 请求。若未来本地 Qwen provider 需要该字段，应在 Phase 1 model router 中由 provider-specific request transform 注入。

## README 和 .env.example

README 更新方向：

```txt
1. 强调 local-first != local-model-first
2. 主路径是 API-first OpenAI-compatible endpoint
3. 本地 MLX/Qwen 是 optional fallback
4. 当前 T2I runtime 已移除
5. 未来图像生成会通过 capability/plugin 系统重新加入
6. 说明 FeatureFlags 是启动时手动配置
7. 增加 cyrene config doctor 用法
```

`.env.example` 更新方向：

```txt
CYRENE_BASE_URL=https://api.example.com/v1
CYRENE_MODEL=strong-model-name
CYRENE_API_KEY=

CYRENE_ENABLE_BASH=1
CYRENE_ENABLE_WEB_SEARCH=1
CYRENE_ENABLE_MCP=0
```

删除所有 `T2I_*` 示例。

## 测试策略

更新和新增测试：

```txt
tests/config.test.ts
  - reads API-first model config
  - reads optional CYRENE_API_KEY
  - defaults FeatureFlags correctly
  - reads FeatureFlags env overrides
  - no T2I config is present

tests/tool-list.test.ts
  - default tools exclude generate_image
  - disabled bash does not appear in tool list
  - disabled web_search does not appear in tool list

tests/web-prompt-context.test.ts
  - buildAgentRuntime passes config into createCoreTools
  - runtime tools follow FeatureFlags

tests/llm-client.test.ts
  - sends Authorization header when CYRENE_API_KEY is set
  - omits Authorization header when unset
  - does not include chat_template_kwargs in generic request body

tests/main-cli.test.ts
  - cyrene config doctor prints model/tool/T2I status
```

删除 T2I 专属测试：

```txt
tests/generate-image-tool.test.ts
tests/t2i-worker.test.ts
tests/t2i-worker-smoke.test.ts
```

## 错误处理

如果模型尝试调用已删除的 `generate_image`，`agent-loop` 现有 unknown tool 逻辑会返回 unavailable/unknown tool 结果。正常情况下模型不会看到 `generate_image`，因此不应主动调用它。

如果用户仍在 `.env` 中配置 `T2I_*`，Phase 0 不读取这些变量。README 应提示这些配置已无效。

如果用户关闭 `CYRENE_ENABLE_BASH=0`，`bash` 不进入 tool schema。模型无法调用它。不会做自动恢复或自动开启。

如果 `CYRENE_API_KEY` 缺失但用户使用本地 endpoint，doctor 不 warning。若 endpoint 是远程 HTTPS，doctor warning。

## 验收标准

Phase 0 完成后应满足：

```txt
[ ] npm run dev -- --web 不启动 T2I worker
[ ] src/tools/index.ts 不再导入 generate-image
[ ] createCoreTools(config) 默认不返回 generate_image
[ ] disabled tools 不进入 toolDefinitions()
[ ] AppConfig 不包含 t2i 配置
[ ] .env.example 不包含 T2I_* 配置
[ ] README 不再把本地 SD1.5 描述为当前能力
[ ] cyrene config doctor 可运行并显示模型/工具/T2I removed 状态
[ ] /Users/phoenix/Assistant/Cyrene/T2I 被删除
[ ] /Users/phoenix/Assistant/Cyrene/.venv-t2i 被删除
[ ] /Users/phoenix/Assistant/Cyrene/Qwen3.5-9B-MLX-4bit 保留
[ ] npm run typecheck 通过
[ ] npm test 通过
```

## 不做的事

本次不做：

```txt
通用 capability/plugin registry
Web UI 工具开关
session-level tool toggles
remote image API provider
ComfyUI / SD WebUI provider
T2I legacy compatibility
model router
trace store
typed memory
affect state
eval harness
controlled evolution
```

这些内容保留给后续 Phase。
