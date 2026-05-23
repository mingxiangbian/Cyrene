# Phase 2 Trace Store Replay Design

## 状态

Approved for planning.

## 背景

Phase 0 已经把 Cyrene 收敛到 `API-first` 基线，移除 legacy T2I runtime，并让工具注册由 config 驱动。Phase 1 已经加入 `Model Router`、DeepSeek profile、provider metadata、thinking mode 和 context window metadata。

Phase 2 的目标是给后续 typed memory、eval harness 和 controlled evolution 提供可观察、可追溯的 run 证据。没有 trace，后续的 memory evidence、eval report 和 evolution proposal 都缺少稳定来源。

当前代码已有可复用基础：

```txt
src/agent-loop.ts        // agent 主循环，已有 observer 事件和 callModel 注入点
src/ui-observer.ts       // AgentObserver: thinking/tool/final 事件
src/web/web-observer.ts  // Web SSE event adapter
src/session-store.ts     // session JSONL，用于 Web/REPL resume
src/llm-client.ts        // callModel 入口，返回 route/provider metadata
src/models/*             // route/capability/usage metadata
```

本设计选择 A1：新增轻量 `TraceRecorder` 旁路记录层，不改整体架构，不把 tracing 逻辑塞进 `agent-loop`。

## 目标

Phase 2 v0 覆盖：

- 每次 CLI one-shot、REPL turn、Web run 都创建持久 `runId`。
- 每个 run 写入 `.cyrene/runs/{runId}/`。
- 记录输入、messages、model calls、tool calls、final output 和 metrics。
- 记录内容默认是 summary-first，不保存完整 raw tool input/output。
- 新增最小 CLI replay：`cyrene trace replay <runId>`。
- replay v0 只恢复或显示 `messages.jsonl` transcript，不重新执行 tools，不重新请求模型。

## 非目标

Phase 2 v0 不做：

- Web UI Trace 面板。
- deterministic replay。
- 自动重新执行 tools。
- 保存完整 raw model request body / response body。
- 保存完整 raw tool arguments / raw tool output。
- filesystem snapshot、patch diff、step-level rollback。
- eval harness、typed memory、affect state 或 evolution proposal。

这些能力后续应分别进入 Phase 2b、Phase 5、Phase 3、Phase 4 和 Phase 6。

## 设计原则

1. `session-store` 继续负责聊天历史和 UI resume；`trace-store` 负责行为审计和 replay evidence。
2. `agent-loop` 保持核心职责，只做必要的可观测性补点。
3. trace 写入失败不应吞掉用户最终答案。
4. v0 默认不保存完整 raw tool payload，先避免 secret 泄露和 trace 体积膨胀。
5. replay v0 是 transcript replay / inspect replay，不是 side-effect replay。

## 目录结构

新增：

```txt
src/tracing/
  types.ts
  trace-store.ts
  run-recorder.ts
  replay.ts
```

持久化目录：

```txt
.cyrene/runs/{runId}/
  input.json
  messages.jsonl
  tool-calls.jsonl
  model-calls.jsonl
  final.md
  metrics.json
```

`runId` 使用安全 ID，例如 `randomUUID()`。所有 trace path 必须留在 `.cyrene/runs/` 下，拒绝路径穿越。

## Trace 文件

### input.json

记录 run 入口 metadata：

```ts
interface TraceInput {
  runId: string;
  mode: 'cli' | 'repl' | 'web';
  cwd: string;
  workspaceId?: string;
  workspacePath?: string;
  sessionId?: string;
  startedAt: string;
  userMessage: {
    role: 'user';
    content: string;
  };
  modelContext?: ModelContextInfo;
}
```

`cwd` 和 `workspacePath` 是本地路径，属于 local-first runtime 的正常审计信息。API key、Authorization header 和 `.env` 内容不进入 `input.json`。

### messages.jsonl

记录 `agent-loop` 实际追加的 non-system `ChatMessage`：

```ts
interface TraceMessageLine {
  at: string;
  message: ChatMessage;
}
```

`providerMetadata` 可以保留，因为 DeepSeek thinking replay 和 usage metadata 已经在 Phase 1 设计中进入 session history。`system` message 不写入 trace v0，避免复制完整 system prompt。

### model-calls.jsonl

记录每次 `callModel` 的 metadata：

```ts
interface TraceModelCallLine {
  callId: string;
  at: string;
  useCase: ModelUseCase;
  provider?: ModelProviderName;
  model?: string;
  thinkingMode?: ThinkingMode;
  messageCount: number;
  toolCount: number;
  durationMs: number;
  ok: boolean;
  usage?: NormalizedUsage;
  error?: string;
}
```

v0 不保存完整 request body。`messageCount` 和 `toolCount` 足够支持后续性能、成本和行为分析的第一层指标。

### tool-calls.jsonl

记录每次 tool call 的 summary：

```ts
interface TraceToolCallLine {
  toolCallId: string;
  at: string;
  name: string;
  inputSummary: string;
  outputSummary?: string;
  durationMs?: number;
  ok?: boolean;
  error?: string;
}
```

v0 不保存完整 raw `arguments` 或 raw tool output。`inputSummary` 沿用 `toolCallSummary(...)`，`outputSummary` 沿用当前 observer 使用的 result summary。为了把 start/result 和 `messages.jsonl` 中的 assistant tool call 对上，`AgentObserver` 或 tracing hook 需要拿到 `toolCallId`。

### final.md

保存最终回答文本。失败 run 可为空或保存错误摘要，实际状态以 `metrics.json.status` 为准。

### metrics.json

记录 run 汇总：

```ts
interface TraceMetrics {
  runId: string;
  status: 'ok' | 'error';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  modelCallCount: number;
  toolCallCount: number;
  errorCount: number;
  finalTextLength: number;
}
```

## Runtime 接入

### TraceStore

`trace-store.ts` 负责：

- 创建 run directory。
- 写入 `input.json`。
- append `messages.jsonl`、`model-calls.jsonl`、`tool-calls.jsonl`。
- 写入 `final.md` 和 `metrics.json`。
- 校验 runId 和路径安全。

它不理解 agent 行为，只提供持久化 API。

### RunRecorder

`run-recorder.ts` 负责：

- 包装 `callModel`，记录 model call metadata、duration、usage 和 error。
- 组合 `AgentObserver`，转发现有 terminal/Web observer 事件，同时记录 thinking/tool/final。
- 维护 model/tool/error counters。
- 在 run 结束时 `finalize()`。

调用方可以使用：

```ts
const recorder = await createRunRecorder(...)
const result = await runAgentLoop({
  ...,
  callModel: recorder.wrapCallModel(callModel),
  observer: recorder.createObserver(baseObserver)
})
await recorder.finalize({ status: 'ok', finalText: result.finalText })
```

如果 `trace-store` 写入失败，recorder 应捕获并记录 warning，不让 run 主路径失败。

### AgentObserver 补点

当前 observer tool events 只有：

```ts
onToolCallStart(name, summary)
onToolCallResult(name, ok, durationMs, summary)
```

Phase 2 v0 需要最小扩展：

```ts
onToolCallStart(name, summary, toolCallId?)
onToolCallResult(name, ok, durationMs, summary, toolCallId?)
```

现有 observer 实现可以忽略新增参数。`agent-loop` 在调用 observer 时传入 `toolCall.id`。这不是暴露 raw input，只是暴露关联字段。

### messages 记录

为了避免大量侵入 `agent-loop`，v0 可以在 run 结束后记录调用方可见的 `messages` delta：

- CLI one-shot：记录 run 内新增的 user/assistant/tool messages。
- REPL turn：记录本 turn 新增的 user/assistant/tool messages。
- Web run：沿用 `runWebAgent` 中已有 `persistedStartIndex` 逻辑，记录 `modelMessages.slice(persistedStartIndex)`。

这和现有 session persistence 方向一致，避免在 `agent-loop` 每次 `messages.push` 处插入 trace code。

## Mode 接入

### CLI one-shot

`src/main.ts` 在调用 `runAgentLoop` 前创建 recorder：

```txt
mode = cli
sessionId = undefined
workspace = cwd
```

命令结束后写入 trace。终端可在 stderr 显示：

```txt
trace: .cyrene/runs/{runId}
```

### REPL

每个 user turn 是一个 run：

```txt
mode = repl
sessionId = current repl session id
```

这样一个 REPL session 可以包含多个 run traces。session 负责连续对话，trace 负责每个 turn 的行为证据。

### Web

Web 已有 in-memory `RunRecord.id`。Phase 2 应让这个 ID 成为持久 trace `runId`，或者用同一个 `runId` 初始化 `TraceRecorder`。

Web v0 不新增 Trace 面板。SSE events 保持现状。

## Replay v0

新增 CLI：

```bash
cyrene trace replay <runId>
```

行为：

- 读取 `.cyrene/runs/{runId}/messages.jsonl`。
- 输出可读 transcript。
- 不重新执行 tools。
- 不重新请求模型。
- 找不到 run 或 runId 非法时给出清晰错误。

`src/tracing/replay.ts` 同时提供 helper：

```ts
loadTraceMessages(cwd: string, runId: string): Promise<ChatMessage[]>
```

后续如果要实现 “从 trace 继续对话”，可以复用这个 helper，但不属于 v0。

## 错误处理

- trace directory 创建失败：run 继续，stderr 或 Web internal warning 记录失败原因。
- model call 失败：写入 `model-calls.jsonl`，`ok=false`，记录 sanitized error message。
- run 失败：尽力写 `metrics.json`，`status='error'`。
- replay 读到损坏 JSONL：返回错误，避免用户误以为 replay 完整。
- unsafe runId：直接拒绝。

## 测试计划

新增或更新：

```txt
tests/trace-store.test.ts
  - creates run directory and input.json
  - appends JSONL files
  - finalizes final.md and metrics.json
  - rejects unsafe runId

tests/run-recorder.test.ts
  - records successful model call metadata
  - records failed model call metadata
  - forwards observer events to base observer
  - records tool start/result with toolCallId

tests/replay.test.ts
  - loads messages from messages.jsonl
  - trace replay rejects missing run

tests/main-cli.test.ts
  - one-shot run creates trace
  - trace replay command prints transcript

tests/repl.test.ts
  - repl turn creates trace with sessionId

tests/web-server.test.ts
  - web run creates trace using runId
```

验证命令：

```bash
npm run typecheck
npm test
npm run dev -- trace replay <runId>
```

## 验收标准

- 每次 CLI one-shot、REPL turn、Web run 都有持久 `runId`。
- `.cyrene/runs/{runId}/` 包含 `input.json`、`messages.jsonl`、`tool-calls.jsonl`、`model-calls.jsonl`、`final.md`、`metrics.json`。
- `model-calls.jsonl` 记录 useCase、provider/model、duration、usage、ok/error，不保存 API key。
- `tool-calls.jsonl` 记录 toolCallId、name、inputSummary、outputSummary、duration、ok/error，不保存 raw tool payload。
- `cyrene trace replay <runId>` 可以读取 run messages 并输出 transcript。
- `agent-loop` 不包含 trace 文件写入逻辑，只做最小 observer/hook 补点。
- `npm run typecheck` 和 `npm test` 通过。
