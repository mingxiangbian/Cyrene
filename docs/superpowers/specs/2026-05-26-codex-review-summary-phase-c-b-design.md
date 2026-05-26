# Codex Review Summary Phase C-B Design

Ready for user review.

## 背景

Phase A 已完成本机 Codex global bridge。Phase B 已完成 pending-only memory propose。Phase C-A 已完成 Codex-native pending review：Codex 可以在聊天中展示 pending memory，并在用户明确 approve/reject 后 promote 或 reject。

Phase B 曾刻意不做 broad transcript summarization，因为当时缺少更强的 redaction 和 review-safe summary。Phase C-B 现在补上这层安全边界，让 Codex Stop hook 可以每轮自动生成短的 redacted review summary，并只在有明确长期记忆价值时生成 pending memory。

## 决策

本阶段选择：

```txt
Stop hook 每轮生成并持久化 redacted review summary，使用 cheap model 判断 memory candidates，候选仍保持 pending-only。
```

含义：

- Stop hook 每轮读取最近 Codex transcript。
- 写入任何 summary 或 candidate 前，先做本地 deterministic redaction。
- LLM 使用适合简单总结的 cheap route，不使用强模型作为默认。
- 每轮保存一条短的 review summary 记录，即使没有 memory candidate。
- 只有有长期记忆价值时才调用 `proposeCodexMemoryCandidate` 写入 pending。
- pending memory 不自动进入 active memory，仍必须走 Phase C-A 的人工 approve/reject。
- 模型配置缺失、调用失败、JSON 解析失败或 transcript 不可读时，Stop hook 不阻塞 Codex。

## Goals

- 新增 Codex review summary runtime，用于 Stop hook 的每轮自动总结。
- 新增本地 redaction 层，覆盖常见 secret 和个人标识符。
- 每轮向 Codex project memory root 写入 `review-summaries.jsonl`。
- LLM 输出严格 JSON，包含短 summary、redaction metadata、candidate 列表。
- candidate 写入继续复用 `proposeCodexMemoryCandidate`，保持 pending-only。
- 输出写入前再次 redaction，避免模型把敏感内容复原或重新暴露。
- Stop hook 在失败时返回 graceful result，不抛出会中断 Codex 的错误。
- 保留已有显式 `记住` 路径的行为，或由新流程等价覆盖。

## Non-Goals

- 不做 pending 自动 promote。
- 不把 review summary 当作 active continuity memory 注入 prompt。
- 不做 Web UI review console。
- 不做原生 Codex permission-style 弹窗。
- 不保存完整 transcript snapshot。
- 不保存未脱敏原文 quote。
- 不把所有实现日志都变成 memory candidate。
- 不新增独立模型配置系统；复用现有 model router。

## 用户体验

### 没有记忆价值的普通轮次

Stop hook 生成一条短 summary，例如：

```txt
用户询问 Phase C-B 模型策略，确认自动总结适合使用 cheap model。
```

该 summary 会写入 `review-summaries.jsonl`，但不会生成 pending memory。

### 有记忆价值的轮次

如果 LLM 判断该轮包含稳定偏好、项目事实、工作流程规则或明确 durable memory instruction，Stop hook 会：

1. 写入 redacted review summary。
2. 生成 candidate。
3. 调用 `proposeCodexMemoryCandidate` 写入 pending。
4. 返回 pending candidate id。

下一次 `cyrene_continuity_get` 会通过 Phase C-A 的 pending review path 提醒 Codex 展示候选，并等待用户 approve/reject。

### 失败轮次

如果模型不可用或输出不可解析，Stop hook 写入一条不含 transcript 内容的 failure audit summary record，返回 graceful `noop` 或 `summary_failed`。Codex 当前工作不应因此失败。

## Architecture

### `codex-hook-stop`

`codex-hook-stop` 仍是 Stop hook 入口，但职责会变薄：

- 读取 hook payload。
- 解析 `cwd`、`session_id`、`turn_id`、`transcript_path`。
- 调用新的 review summary runtime。
- 把 runtime result 转成 hook result JSON。

它不直接构造 LLM prompt，也不直接写 review summary 文件。

### `codex-review-summary`

新增 Codex 专用 runtime，负责：

- 从 transcript 中提取最近 messages。
- 生成稳定 `runId`。
- 对 messages 做本地 redaction。
- 构造 review-safe summarization prompt。
- 调用 `callModel`。
- 解析和校验 JSON。
- 对 LLM 输出再次 redaction。
- 写入 `review-summaries.jsonl`。
- 对 candidates 调用 `proposeCodexMemoryCandidate`。

这个 runtime 与 `src/memory/memory-candidate-extractor.ts` 分开。后者面向普通 Cyrene completed run，输入是 `userPrompt + finalText`；C-B 面向 Codex transcript，输入是多消息对话和 Stop hook metadata。

### `redaction`

新增一个小的本地 redaction helper，优先覆盖高风险且容易识别的内容：

- `sk-...`、`Bearer ...`、常见 API token。
- `.env` 风格 secret，例如 `*_API_KEY=...`、`TOKEN=...`、`PASSWORD=...`。
- PEM/private key block。
- 长随机 token。
- email。
- phone-like number。

Redaction 输出：

```ts
{
  text: string,
  counts: Record<string, number>
}
```

Prompt 输入、summary 输出、candidate content、candidate evidence 都必须经过 redaction。

## Data Flow

```txt
Codex Stop hook payload
  -> transcript_path
  -> parse recent transcript messages
  -> local redaction
  -> cheap model JSON summary/candidates
  -> redact model output again
  -> append review-summaries.jsonl
  -> propose pending memory candidates when present
  -> hook JSON result
```

Transcript window 默认限制为最近 40 条可解析 messages，避免把整段长期会话送入 Stop hook LLM，保持成本和隐私面可控。

## Model Policy

LLM 调用复用现有 `callModel` 和 provider router：

- `useCase` 使用 `memory_extraction`，因为同一次 LLM 调用既生成 review summary，也判断 memory candidates。
- `memory_extraction` 已走 `cheapModel`。
- cheap route 会关闭 thinking，并使用 temperature 0。
- 如果 `CYRENE_CHEAP_MODEL` 未配置，则沿用现有 fallback 到 strong model 的行为。
- 如果模型 base/model/api key 缺失或调用失败，本阶段不把错误抛出到 Codex。

Phase C-B 不新增单独的模型 env。这样配置面保持简单。

## Review Summary Storage

每轮写入 Codex project memory root 下的 `review-summaries.jsonl`。单条记录建议结构：

```ts
{
  id: string,
  runId: string,
  sessionId?: string,
  turnId?: string,
  createdAt: string,
  status: 'ok' | 'failed',
  summary: string,
  redaction: {
    input: Record<string, number>,
    output: Record<string, number>
  },
  model?: {
    useCase: 'memory_extraction',
    model?: string
  },
  candidateIds: string[],
  failureReason?: string
}
```

`summary` 必须是短文本，不包含未脱敏 quote。失败记录的 `summary` 应是固定安全文本，例如 `Codex review summary failed; no transcript content persisted.`。

## Candidate Policy

LLM 可以返回 0 到多条 candidates，但 prompt 要强约束：

- Prefer no candidates over weak candidates。
- 只记录稳定偏好、项目事实、明确流程规则、长期有用的系统集成事实。
- 不从 assistant 建议、用户沉默或一次性实现日志推断长期偏好。
- 不记录心理诊断、情绪身份化判断或亲密关系想象。
- 不记录 secret、credential、未脱敏个人信息。
- evidence 使用 redacted summary，不保存 raw quote。

写入 candidate 前，runtime 仍调用 `proposeCodexMemoryCandidate`。已有 validator 继续负责 dedupe、tombstone、pending-only downgrade 和 safety scoring。

## Hook Result Contract

Stop hook 结果保持机器可读，建议扩展为：

```ts
type CodexStopHookResult =
  | { action: 'noop'; reason: string; summaryId?: string }
  | { action: 'summary'; summaryId: string; reason: string }
  | { action: 'pending'; summaryId: string; candidateIds: string[]; reason: string }
  | { action: 'reject'; summaryId?: string; reason: string }
  | { action: 'summary_failed'; reason: string }
```

旧的单 candidate `pending` 结果可在实现时兼容保留，但 C-B 主路径应支持多 candidate ids。

## Error Handling

- transcript path 缺失：返回 noop，不写 summary。
- transcript 文件不存在：返回 noop，不写 summary。
- transcript 解析部分失败：忽略坏行，继续处理可解析 messages。
- 没有可总结 messages：返回 noop，不写 summary。
- 模型调用失败：写 failed summary record，返回 `summary_failed`。
- JSON 解析失败：写 failed summary record，返回 `summary_failed`。
- candidate propose 被 validator reject：summary 仍保留，hook result 可包含 reject reason，但不阻塞。
- review summary 写入失败：返回 `summary_failed`，不再尝试写 pending，避免候选缺少审计摘要。

## Testing

新增或更新测试覆盖：

- redaction 会替换 API key、Bearer token、`.env` secret、private key、email。
- 无 memory candidate 时仍写 `review-summaries.jsonl`，不写 pending。
- 有 memory candidate 时写 summary，并写 pending candidate。
- LLM 失败时写 failed summary record，不抛出阻塞错误。
- LLM 返回敏感内容时，输出落盘前被再次 redaction。
- 多 candidate 返回时，hook result 包含多个 candidate ids。
- transcript 坏行不会导致整个 hook 失败。
- 显式 `记住` 类型输入仍能生成 pending memory。

## 验证方式

实现完成后应至少运行：

```sh
npm test
npm run typecheck
```

并用一个临时 transcript fixture 手动验证：

1. 普通对话会生成 review summary，但 pending 为空。
2. “以后默认 spec 和 plan 用中文写”会生成 review summary 和 pending candidate。
3. 含 token/email 的 transcript 不会把原文 secret 写入 `review-summaries.jsonl` 或 pending evidence。

## 已确认选择与实现留白

当前设计已固定以下选择：

- 每轮 redacted summary 默认持久化。
- 使用 cheap model route。
- 模型失败不阻塞 Codex。
- Phase C-B 不做 approve/reject UI 升级。

剩余实现细节由 implementation plan 决定：redaction regex 的精确边界、hook result 是否保留完全向后兼容字段。
