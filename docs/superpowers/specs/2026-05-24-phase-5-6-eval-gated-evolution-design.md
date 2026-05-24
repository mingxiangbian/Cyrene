# Phase 5+6 Eval-gated Controlled Evolution Design

## 状态

Ready for user review.

本 spec 合并原路线图中的 Phase 5 `Eval Harness` 和 Phase 6 `Controlled Evolution Loop`，但只实现 v0 范围：

```txt
Eval-gated Controlled Evolution v0
```

核心目标是让 Cyrene 能提出可审计的改进 proposal，并且所有可应用的 proposal 都必须经过 eval、deterministic gate 和必要的人工批准。

本设计不进入 implementation plan，不修改 runtime 代码。后续实现必须从本 spec 生成独立 plan。

## 背景

Phase 0 已把 Cyrene 收敛为 `API-first`、`local-first` runtime，不再围绕本地重型模型或 legacy T2I 扩张。

Phase 1 已引入 `Model Router`、`ModelUseCase`、provider metadata、cheap/strong route 和 context capability。

Phase 2 已建立 `.cyrene/runs/{runId}/` trace store 和 replay，CLI one-shot、REPL turn、Web run 都能留下 run evidence。

Phase 3 已把 memory 升级为 typed personal memory core。`index.jsonl` 是 source of truth，memory candidate 必须经过 validator/lifecycle，不允许把 assistant 自评、临时情绪或诊断化判断直接写入 active memory。

Phase 4 已建立 affect / relationship / response strategy 层，并明确：

```txt
Cyrene 没有主观情绪。
Cyrene 可以有稳定、可审计、可纠正的表达契约。
Cyrene 可以基于原则、证据和风险反驳用户。
```

Phase 5+6 v0 的任务是把 `eval` 和 `evolution` 接成闭环：

```txt
trace / fixture
  -> eval runner
  -> eval report
  -> reflection
  -> proposal
  -> promotion gate
  -> auto action or approval_required
```

这里的重点不是让 Cyrene 立刻“自我进化”，而是先建立门锁：没有 eval evidence 的 proposal 不能 promote；高风险 proposal 必须人工批准。

## 目标

本次覆盖：

- 新增本地 deterministic `cyrene eval` harness。
- 新增 eval fixture、grader、runner 和 machine-readable report schema。
- 新增 `.cyrene/evals/{evalRunId}/` 持久化。
- 新增 evolution proposal store。
- 支持 `memory`、`procedural`、`tool_usage_note`、`prompt` 四类 proposal。
- 明确拒绝 v0 不支持的 `skill`、`code`、`permission`、`shell_policy` proposal。
- 新增 promotion gate，用 deterministic rules 裁决 proposal 状态。
- 新增 CLI approval flow：`list`、`inspect`、`approve`、`reject`。
- 新增 post-run lightweight reflection 的数据结构和持久化格式。
- 为 Phase 7 预留 Web UI approve/reject 面板和对话下方 lightweight reflection 展示所需数据。

## 非目标

本次明确不做：

- 不实现 skill system。
- 不新增 `skill-registry`。
- 不生成或安装 skill。
- 不允许 Cyrene 修改核心代码。
- 不允许 proposal 扩大 tool permission、shell 权限或 workspace 边界。
- 不自动应用 system prompt 修改。
- 不自动删除、覆盖或降权 existing memory。
- 不做大型真实模型 benchmark。
- 不做 Web UI Evolution 面板。Phase 7 再做。
- 不做 proposal diff 的复杂三方 merge。
- 不做后台 daemon。
- 不把 reflection summary 注入下一轮 prompt。
- 不把 reflection 当作 Cyrene 的内心活动展示。

## 设计原则

1. 模型只能提出 proposal，不能决定是否写入 memory 或修改 prompt。
2. Gate 由代码规则、eval evidence、risk classification 和人工批准组成。
3. `cyrene eval` 必须可以独立运行，不依赖 evolution。
4. Evolution 必须引用 eval result，不能只靠模型自评。
5. Prompt proposal 永不自动应用。
6. Memory/procedural proposal 必须复用 Phase 3 memory validator，不另写一套 memory 判断。
7. Affect 和 relationship 相关 proposal 必须遵守 Phase 4 persona boundaries。
8. Eval 和 proposal 写入失败不能阻塞用户主回复。
9. 所有持久化路径必须留在 `.cyrene/` 下，拒绝路径穿越和 symlink 写入。
10. Phase 7 UI 只消费本 phase 产出的 reflection/proposal/eval 数据，不反向改变 gate 规则。

## 推荐方案

采用：

```txt
Eval-first gated proposal loop
```

也就是先建立 `cyrene eval`，再让 evolution proposal 必须附带 eval report。这个方案最适合当前状态，因为 Phase 2-4 已经提供了 trace、memory、affect 的可测边界。

不采用：

```txt
Proposal-first loop
```

原因是它会先产生“看似聪明”的 proposal，但缺少 eval 约束，和 Phase 5 的目的冲突。

不采用完整 Phase 6：

```txt
memory / prompt / skill / code 全部纳入 proposal
```

原因是 skill 系统还没设计，核心代码自修改和权限扩大也不适合在 v0 进入 scope。

## 架构

新增目录：

```txt
src/evals/
  types.ts
  eval-runner.ts
  fixtures/
  graders/
  report.ts

src/evolution/
  types.ts
  reflection.ts
  proposal-store.ts
  memory-proposer.ts
  prompt-proposer.ts
  promotion-gate.ts
```

持久化目录：

```txt
.cyrene/evals/{evalRunId}/
  input.json
  results.json
  report.md

.cyrene/proposals/{proposalId}/
  proposal.json
  rationale.md
  eval-results.json
  approval.json
  prompt.patch.diff

.cyrene/reflections/
  {runId}.json
  index.jsonl
```

`prompt.patch.diff` 只对 `prompt` proposal 存在。`approval.json` 只在 approve/reject 后存在。

## Eval Harness

Phase 5+6 v0 的 eval 不追求通用模型能力 benchmark，而是追求 runtime 行为回归检测。第一版尽量 deterministic，避免真实模型输出波动让 harness 本身变成噪声源。

### Eval 类型

```ts
export type EvalSuite =
  | 'trace'
  | 'memory'
  | 'affect'
  | 'security'
  | 'evolution'

export type EvalCaseKind =
  | 'pure'
  | 'agent_run'
  | 'module_contract'

export interface EvalCase {
  id: string
  suite: EvalSuite
  title: string
  kind: EvalCaseKind
  tags: string[]
  input: unknown
  expected: unknown
  blocking: boolean
}

export interface EvalCaseResult {
  id: string
  suite: EvalSuite
  passed: boolean
  score: number
  blocking: boolean
  failures: string[]
  evidence?: Record<string, unknown>
}

export interface EvalReport {
  evalRunId: string
  target: 'local-runtime' | 'proposal'
  proposalId?: string
  startedAt: string
  finishedAt: string
  passed: boolean
  score: number
  suites: Record<string, { passed: boolean; score: number }>
  blockingFailures: EvalCaseResult[]
  results: EvalCaseResult[]
}
```

### Eval Suites

`trace` suite 验证：

- `RunRecorder` 能写入 expected trace files。
- `messages.jsonl` 不包含 system prompt。
- `model-calls.jsonl` 不保存 API key。
- replay 能读取 transcript。
- trace path 不能路径穿越。

`memory` suite 验证：

- 稳定 project fact 可以 auto_write。
- implicit personal preference 默认 pending 或 soft。
- 临时情绪不能写成长期人格。
- diagnostic affective memory 被 reject。
- repeated pending candidate 可以按 Phase 3 lifecycle promote。
- tombstone 能阻止重复写回。

`affect` suite 验证：

- distressed/frustrated user text 不产生心理诊断 label。
- `ResponseStrategy` 不声称 subjective emotion。
- relationship state 只保存 evidence memory ids，不复制 memory 原文。
- prompt proposal 不能引入“Cyrene 有真实情绪”之类表达。

`security` suite 验证：

- shell deny patterns 对高风险命令生效。
- workspace 外写入被拒绝。
- proposal path 拒绝路径穿越。
- unsupported permission/shell proposal 被 reject。
- eval/proposal 文件不保存 secret。

`evolution` suite 验证：

- proposal schema 必须有效。
- unsupported `skill` / `code` / `permission` / `shell_policy` proposal 被 reject。
- prompt proposal 永远 `approval_required`。
- 没有 eval report 的 proposal 不能 promote。
- blocking eval failure 会阻止 promote。
- approve 时必须校验 `proposalHash`。

### Grader Registry

第一版不引入插件系统，只用显式 registry：

```ts
const graders = {
  trace: gradeTraceCase,
  memory: gradeMemoryCase,
  affect: gradeAffectCase,
  security: gradeSecurityCase,
  evolution: gradeEvolutionCase
}
```

`eval-runner` 根据 `suite` 调度 grader。每个 grader 返回 `EvalCaseResult`，不直接写 report。

### CLI

新增命令：

```bash
cyrene eval
cyrene eval --suite memory
cyrene eval --suite memory --suite affect
cyrene eval --json
cyrene eval --proposal <proposalId>
```

默认行为：

- 写 `.cyrene/evals/{evalRunId}/input.json`。
- 写 `.cyrene/evals/{evalRunId}/results.json`。
- 写 `.cyrene/evals/{evalRunId}/report.md`。
- stdout 输出简短摘要。
- 有 blocking failure 时 exit code 为 `1`。
- 只有非 blocking failure 时 exit code 仍为 `0`，但 score 降低。

## Evolution Proposal

第一版 proposal 类型：

```ts
export type EvolutionProposalType =
  | 'memory'
  | 'procedural'
  | 'tool_usage_note'
  | 'prompt'
```

明确拒绝：

```ts
export type UnsupportedEvolutionProposalType =
  | 'skill'
  | 'code'
  | 'permission'
  | 'shell_policy'
```

这些类型在 v0 中必须被 gate 标记为 `unsupported` 或 `rejected`，不能降级成其他 proposal 类型。

### Proposal Schema

```ts
export type EvolutionProposalStatus =
  | 'draft'
  | 'eligible'
  | 'approval_required'
  | 'approved'
  | 'rejected'
  | 'applied'
  | 'blocked'

export type EvolutionRisk = 'low' | 'medium' | 'high'

export interface EvolutionProposal {
  id: string
  type: EvolutionProposalType
  status: EvolutionProposalStatus
  risk: EvolutionRisk
  sourceRunIds: string[]
  evidence: string[]
  summary: string
  proposedChange: unknown
  evalRunId?: string
  approvalRequired: boolean
  gateReason: string
  createdAt: string
  proposalHash: string
}
```

`proposalHash` 由 proposal 内容和 relevant artifact 内容计算，不包含 `approval.json`。批准和 apply 前都必须重新计算并匹配。

### Proposal Store

`proposal-store` 负责：

- 创建 proposal directory。
- 写 `proposal.json`。
- 写 `rationale.md`。
- 写 `eval-results.json`。
- 对 prompt proposal 写 `prompt.patch.diff`。
- 读取 proposal list。
- 读取单个 proposal。
- 写 `approval.json`。
- 拒绝非法 `proposalId` 和路径穿越。
- 拒绝 symlink 写入。

`proposal-store` 不负责执行 gate，也不负责 apply。

## Promotion Gate

Gate 执行顺序：

```txt
1. schema validation
2. proposal type allowlist
3. risk classification
4. evidence check
5. relevant eval suites
6. deterministic safety policy
7. approval requirement decision
8. optional apply / pending / block
```

### Memory / Procedural / Tool Usage Note

低风险自动路径：

```txt
type in memory/procedural/tool_usage_note
+ risk low
+ sourceRunIds non-empty
+ evidence non-empty
+ relevant eval suites passed
+ memory validator passed when applicable
=> eligible
```

`eligible` 在 v0 中可以执行两个保守动作之一：

```txt
memory/procedural -> write pending candidate or proposal state
tool_usage_note   -> write low-risk note if eval passed
```

第一版不直接把 `memory` 或 `procedural` 写入 active memory，除非它复用 Phase 3 lifecycle 后自然进入 existing allowed path。即便如此，删除、覆盖、降权 existing memory 仍必须人工批准。

必须人工批准：

```txt
- 删除 existing memory
- 覆盖 existing memory
- 降权 existing memory
- medium/high risk personal or relationship memory
- evidence 指向不清晰但仍希望保留的 procedural rule
```

直接阻止：

```txt
- 没有 sourceRunIds
- 没有 evidence
- eval blocking failure
- memory validator reject
- 诊断化 affective memory
- assistant 自评伪装成用户偏好
```

### Prompt Proposal

Prompt proposal 规则更严格：

```txt
prompt proposal
  -> must have prompt.patch.diff
  -> must have eval report
  -> blocking failures must be zero
  -> cannot widen permissions
  -> cannot bypass memory validator
  -> cannot bypass tool approval or workspace boundary
  -> cannot contradict Phase 4 persona boundaries
  -> always approval_required
```

Prompt proposal 永不自动 apply。即使 eval 通过，也只能进入 `approval_required`。

### Unsupported Proposal

以下 proposal 在 v0 中直接 reject：

```txt
skill
code
permission
shell_policy
```

原因：

- skill system 尚未设计。
- 核心代码自修改风险过高。
- permission 和 shell policy 属于安全边界，不能由 evolution v0 自动触碰。

## Approval Flow

人工确认不通过普通对话完成。对话可以解释 proposal，但真正批准必须是明确的本地操作。

新增 CLI：

```bash
cyrene evolution list
cyrene evolution inspect <proposalId>
cyrene evolution approve <proposalId>
cyrene evolution reject <proposalId> --reason "..."
```

`approval.json`：

```json
{
  "proposalId": "proposal-123",
  "status": "approved",
  "channel": "cli",
  "decidedAt": "2026-05-24T00:00:00.000Z",
  "decidedBy": "local-user",
  "evalRunId": "eval-456",
  "proposalHash": "..."
}
```

Reject 也写 `approval.json`：

```json
{
  "proposalId": "proposal-123",
  "status": "rejected",
  "channel": "cli",
  "decidedAt": "2026-05-24T00:00:00.000Z",
  "decidedBy": "local-user",
  "reason": "Too broad for Phase 5+6 v0.",
  "proposalHash": "..."
}
```

Approve 前必须：

- 读取 proposal。
- 重新计算 `proposalHash`。
- 检查 hash 未变化。
- 检查 eval report 仍存在。
- 检查 blocking failures 为 0。
- 检查 proposal 类型允许。
- 检查 prompt proposal 没有自动 apply。

Apply 不是 approve 的默认副作用。第一版可以让 approve 只写 `approval.json`，后续 `cyrene evolution apply <proposalId>` 再决定是否需要单独命令。若实现阶段为了简化选择 approve 后立即对低风险 note apply，也必须在 plan 中明确列出 apply 范围。

## Post-run Reflection

Post-run reflection 的目标不是让 Cyrene 每轮写长篇自评，而是低成本捕捉“这轮是否产生了可复用改进信号”。

触发顺序：

```txt
agent run finalized
  -> trace finalized
  -> memory extraction completed
  -> post-run reflection
  -> optional proposal creation
  -> proposal gate
  -> reflection summary persisted
```

Reflection 应引用完整 run trace 和 memory outcome，不在回答前打断主流程。

### 配置

建议新增：

```env
CYRENE_EVOLUTION_ENABLED=false
CYRENE_EVOLUTION_REFLECTION_MODE=manual|light|off
```

v0 推荐默认：

```txt
CLI/REPL: manual or off
Web: light data-ready, display can wait for Phase 7
Tests: off unless explicitly enabled
```

这样避免每个用户请求都额外触发模型调用，也避免普通对话产生大量低价值 proposal。

### Reflection Schema

```ts
export interface RunReflection {
  runId: string
  mode: 'none' | 'light'
  summary: string
  signal:
    | 'none'
    | 'memory_candidate'
    | 'procedural_candidate'
    | 'tool_usage_note'
    | 'prompt_candidate'
    | 'approval_required'
    | 'blocked'
  proposalIds: string[]
  approvalRequired: boolean
  evalRunIds: string[]
  createdAt: string
}
```

持久化：

```txt
.cyrene/reflections/{runId}.json
.cyrene/reflections/index.jsonl
```

### 噪声控制

规则：

- 没有明确 evidence 时 `signal = none`。
- 不把 reflection summary 注入下一轮 system prompt。
- 不把 reflection 直接写入 active memory。
- `summary` 限制长度，建议 160 字以内。
- 同一 normalized lesson 已有 active/pending/proposal 时不重复生成。
- Eval 失败时可以生成 `blocked` reflection，但不请求 approval。
- Prompt proposal 至少需要一个明确问题源：测试失败、用户纠正、重复 runtime failure 或明确架构冲突。

人工确认提示不是每轮都出现。每次 run 后可以检查 reflection，但只有 gate 判定 `approval_required` 时才提示用户。

## Phase 7 Handoff

Phase 7 可以在 Web UI 增加 approve/reject 面板，并在每次 assistant final message 下方展示 lightweight reflection。

Phase 5+6 v0 只负责准备数据和 CLI/API 边界，不把完整 UI 面板塞入当前实现范围。

### Evolution Panel

Phase 7 面板：

```txt
Evolution
  Pending
  Approved
  Rejected
  Blocked
  Applied
```

每个 proposal 展示：

```txt
- type: memory / procedural / tool_usage_note / prompt
- risk: low / medium / high
- status
- eval status
- summary
- rationale
- proposed content or prompt diff
- Approve
- Reject
```

展示规则：

- Prompt proposal 必须人工 approve。
- Memory 删除/覆盖必须人工 approve。
- Eval blocking failure 时不显示 approve，只显示 blocked。
- Reject 必须允许填写 reason。
- Approve/reject 写入 `approval.json` 或等价 decision artifact。

### Conversation Reflection Badge

Phase 7 对话下方展示字段：

```ts
export interface ConversationReflectionBadge {
  runId: string
  text: string
  severity: 'quiet' | 'info' | 'action'
  proposalIds: string[]
  approvalRequired: boolean
}
```

展示例子：

```txt
Reflection: 没有发现需要保存的长期经验。
```

```txt
Reflection: 发现 1 个 procedural proposal，等待批准。
```

```txt
Reflection: prompt proposal 被 gate 阻止，因为 memory eval 未通过。
```

展示约束：

- 小字、低视觉权重。
- 默认一行，可展开。
- 不展示“我觉得/我意识到”这类拟内心表达。
- 不声明 Cyrene 的情绪。
- 有 pending approval 时提供跳转到 Evolution 面板的入口。
- 没有 proposal 时可以折叠或通过设置关闭。

### Phase 7 API 预留

Phase 7 可新增：

```txt
GET  /api/evolution/proposals
GET  /api/evolution/proposals/:id
POST /api/evolution/proposals/:id/approve
POST /api/evolution/proposals/:id/reject
GET  /api/reflections/:runId
```

Phase 5+6 v0 可以先只做 CLI。若实现阶段提前加只读 API，必须保持 minimal，不加入完整前端状态管理。

## Runtime 集成

CLI one-shot：

```txt
runAgentLoop
  -> trace finalize
  -> memory process
  -> optional reflection
  -> optional proposal
  -> gate
  -> print non-blocking proposal notice if approval_required
```

REPL：

```txt
each turn
  -> same post-run pipeline
  -> print compact pending proposal notice
```

Web：

```txt
runWebAgent
  -> same post-run pipeline
  -> persist reflection/proposal
  -> Phase 7 later reads and displays
```

第一版不应让 post-run reflection 阻塞主回复。Reflection/evolution failure 只记录 warning 或 reflection `blocked`，不能吞掉 final response。

## 与 Phase 0-4 的适配

Phase 0 适配：

- 不新增重型本地模型依赖。
- 不恢复 legacy T2I。
- 不改变 `FeatureFlags` 和 tool registry 规则。

Phase 1 适配：

- Reflection 相关模型调用使用明确 `ModelUseCase`，例如 `reflection`。
- Eval 默认 deterministic，不强制调用模型。
- 不硬编码 provider。

Phase 2 适配：

- Trace 是 eval/evolution 的 evidence source。
- Proposal 必须引用 `sourceRunIds` 或 `evalRunId`。
- Eval 不保存 API key、Authorization header 或完整 raw payload。

Phase 3 适配：

- Memory/procedural proposal 必须经过现有 memory validator/lifecycle。
- Evolution 不绕过 typed memory store。
- Reflection 不直接写 active memory。
- Pending 不参与 prompt 注入。

Phase 4 适配：

- Reflection 和 prompt proposal 不声明 Cyrene 有真实情绪。
- 不生成心理诊断。
- 不通过拟情感制造依赖、愧疚或压力。
- Principled dissent 继续基于证据、风险、边界和长期目标。

## 测试策略

### 模块测试

- `eval-runner` 能加载 fixture、调度 grader、聚合 score。
- `report` 能稳定生成 `results.json` 和 `report.md`。
- `blockingFailures` 正确影响 exit code。
- `proposal-store` 拒绝路径穿越和非法 proposal id。
- `promotion-gate` 正确分类 low/medium/high risk。
- Unsupported proposal 类型直接 rejected。
- Approval 写入 `approval.json`。
- Approve 时重新校验 `proposalHash`。

### Phase 0-4 Contract 测试

- Feature flags 仍控制工具暴露，不被 proposal 绕过。
- Eval/reflection 后台模型调用使用明确 use case。
- Eval 可以引用 trace runId，但不保存 secret。
- Memory/procedural proposal 复用 Phase 3 validator。
- Prompt proposal 不允许引入 Phase 4 禁止的主观情绪或心理诊断表达。

### CLI 集成测试

覆盖：

```bash
cyrene eval
cyrene eval --suite memory
cyrene eval --suite memory --suite affect
cyrene eval --json
cyrene evolution list
cyrene evolution inspect <proposalId>
cyrene evolution approve <proposalId>
cyrene evolution reject <proposalId> --reason "..."
```

## 验收标准

Phase 5+6 v0 完成后应满足：

```txt
[ ] cyrene eval 可运行本地 deterministic eval。
[ ] eval report 写入 .cyrene/evals/{evalRunId}/results.json 和 report.md。
[ ] blocking failure 导致 cyrene eval exit code 1。
[ ] memory/procedural proposal 有 evidence 和 eval result。
[ ] prompt proposal 永远不会自动应用。
[ ] prompt proposal 必须 approval_required。
[ ] approval.json 绑定 proposalHash。
[ ] hash mismatch 时拒绝 approve/apply。
[ ] unsupported skill/code/permission/shell_policy proposal 被拒绝。
[ ] 每次 run 后 reflection 不阻塞主回复。
[ ] 没有可靠 signal 时不生成 proposal。
[ ] Phase 7 可读取 reflection/proposal 数据以展示 approve/reject 面板。
[ ] npm run typecheck 通过。
[ ] npm test 通过。
```

## 风险与缓解

风险：proposal 太多，干扰正常对话。

缓解：默认关闭或 manual/light；没有 reliable evidence 时不生成 proposal；summary 限长；重复 lesson 去重。

风险：模型把自评当成事实写入 memory。

缓解：模型只提 proposal；memory/procedural 必须走 Phase 3 validator；assistant-observed procedural rule 默认 pending。

风险：prompt proposal 绕过安全边界。

缓解：prompt proposal 永远 approval_required；eval blocking failure 阻止 approve；gate 检查权限、安全、Phase 4 boundary。

风险：批准后 proposal 内容被篡改。

缓解：`approval.json` 绑定 `proposalHash`；approve/apply 前重新计算 hash。

风险：Phase 5+6 提前做成 Phase 7 UI。

缓解：本 phase 只写数据、CLI 和可选 minimal API；approve/reject 面板和对话下方 reflection 展示留给 Phase 7。

## Implementation Plan 输入

后续 `writing-plans` 应把实现拆成小步：

```txt
1. eval core types + runner + report
2. deterministic suites: memory / affect / security / evolution
3. CLI: cyrene eval
4. proposal store + proposal hash
5. promotion gate
6. CLI: cyrene evolution list/inspect/approve/reject
7. post-run reflection persistence behind config
8. integration and regression tests
```

每一步都应保持可独立验证，且不能覆盖当前工作区中与本 spec 无关的未提交改动。
