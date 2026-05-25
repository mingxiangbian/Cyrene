# Codex Memory Propose Phase B Design

## 背景

Phase A 已完成本机 Codex global bridge：

- Codex 可通过 Cyrene MCP 读取 project identity。
- Codex 可通过 `cyrene_continuity_get` 获取 compact continuity context。
- `cyrene-continuity` skill 已安装到 `~/.agents/skills/cyrene-continuity`。
- `agentmemory` 已作为 readiness gate 停用。

Phase B 的目标是增加“写入候选记忆”的能力，但仍保持保守边界：Codex 可以把值得记住的内容提交给 Cyrene，Cyrene 只写入 pending memory，不写 active memory。

## 决策

本阶段选择方案 B：

```txt
cyrene_memory_propose + pending-only write + optional Stop hook install
```

同时明确拒绝方案 C：

```txt
直接启用广义 Stop hook 自动总结每轮对话
```

方案 C 等到后期有更强的 redaction 和 review UI 再做。Phase B 的 Stop hook 可以读取 turn context，但只捕获明确 durable signal，不做广义自动总结。

## Goals

- 新增 MCP tool：`cyrene_memory_propose`。
- 新增 Codex pending-only memory propose runtime。
- 写入 Codex project 专属 memory root：

```txt
~/.cyrene/codex/projects/<projectId>/memory/pending.jsonl
~/.cyrene/codex/projects/<projectId>/memory/events.jsonl
```

- 新增可选 Stop hook 安装命令：

```bash
cyrene codex install-hook --stop --dry-run
cyrene codex install-hook --stop
```

- 新增 hook runtime：

```bash
cyrene codex hook stop
```

- 真实安装 hook 时结构化 merge `~/.codex/hooks.json`，保留用户已有 hooks。

## Non-Goals

- 不写 `index.jsonl`。
- 不写 active memory。
- 不 promote pending memory。
- 不 archive/delete/update existing active memory。
- 不做 broad transcript summarization。
- 不把完整 transcript 写入 memory evidence。
- 不做 review UI。
- 不做 redaction pipeline。
- 不做 public plugin packaging。
- 不修改 Codex built-in memory。
- 不恢复或启用 `agentmemory`。

## Architecture

Phase B 增加一条 pending-only 写入路径：

```txt
Codex
  -> cyrene_memory_propose MCP tool
  -> src/codex/memory-propose.ts
  -> ~/.cyrene/codex/projects/<projectId>/memory/pending.jsonl
```

Stop hook 使用同一条写入路径：

```txt
Codex Stop hook
  -> stdin JSON
  -> cyrene codex hook stop
  -> src/codex/codex-hook-stop.ts
  -> src/codex/memory-propose.ts
  -> pending.jsonl / events.jsonl
```

`cyrene_continuity_get` 仍只读取 active memory。pending memory 在 Phase B 不会进入 model-visible continuity context。

## MCP Tool Contract

新增 MCP tool：

```txt
cyrene_memory_propose
```

输入：

```ts
{
  cwd?: string,
  candidate: {
    domain: "project" | "personal" | "relationship" | "affective" | "procedural" | "system",
    type:
      | "project_fact"
      | "user_preference"
      | "interaction_style"
      | "relationship_boundary"
      | "affective_pattern"
      | "procedural_rule"
      | "episode"
      | "system_policy"
      | "reference",
    strength?: "hard" | "soft" | "session",
    scope?: "global" | "project" | "session",
    content: string,
    normalizedKey?: string,
    source?: "user_explicit" | "user_implicit" | "assistant_observed" | "tool_trace" | "file" | "legacy_markdown",
    evidence: [
      {
        runId?: string,
        quote?: string,
        summary?: string
      }
    ],
    scores?: {
      evidenceStrength?: number,
      stability?: number,
      usefulness?: number,
      safety?: number,
      sensitivity?: number
    },
    tags?: string[],
    userConfirmed?: boolean
  }
}
```

输出：

```ts
{
  project: {
    projectId: string,
    displayName: string
  },
  result: {
    action: "pending" | "reject",
    candidateId?: string,
    reason: string
  },
  memoryRoot: string
}
```

默认值：

- `normalizedKey` 缺省时从 `content` 生成稳定 key。
- `source` 缺省为 `assistant_observed`。
- `strength` / `scope` 缺省沿用现有 memory default policy。
- `scores` 缺省使用保守分数，避免误判为 high-confidence active。
- `evidence` 必须存在，且至少有 `summary`、`quote` 或 `runId` 之一。

Phase B 不支持 `mode: "turn"`，不从整轮对话自动调用 model 提取候选。

## Pending-Only Policy

新增窄函数：

```ts
proposeCodexMemoryCandidate(input)
```

该函数不复用 `processMemoryCandidate()`，因为现有 lifecycle 可能 auto-write 或 promote。

处理规则：

- validator 判定为 `reject`：写入 reject event，可写 tombstone 只用于防止重复 unsafe candidate。
- validator 判定为 `pending`：写入 pending。
- validator 判定为 `auto_write`：Phase B 降级为 pending。
- duplicate pending candidate：合并 `seenCount`、`evidence`、`tags`、score average。
- high-confidence candidate：仍然 pending。
- affective / relationship candidate：仍走现有 validator safety rules，但不会 active。

允许写：

```txt
pending.jsonl
events.jsonl
tombstones.jsonl only for rejected unsafe candidates
```

禁止写：

```txt
index.jsonl
memory projections
active memory files
```

## Stop Hook Install

新增 CLI：

```bash
cyrene codex install-hook --stop --dry-run
cyrene codex install-hook --stop
```

`--dry-run` 行为：

- 读取 `~/.codex/hooks.json`。
- 生成 merge 后 JSON。
- 打印将要新增的 Stop hook command。
- 不写文件。

真实安装行为：

- 如果 `~/.codex/hooks.json` 不存在，创建最小 config。
- 如果已存在，结构化 parse JSON。
- 保留现有 hooks。
- 只追加 Cyrene Stop hook entry。
- 如果 Cyrene Stop hook 已存在，保持幂等，不重复添加。
- 写入前不删除用户其他 hook。

当前本机已有 Stop hook 示例：

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/Users/phoenix/.codex/hooks/task_done_sound.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

Phase B 安装后必须保留该 sound hook。

默认 hook command 使用 repo-local dev path，避免依赖 `cyrene` 是否在 PATH：

```txt
npm --prefix /Users/phoenix/Assistant/Cyrene run --silent dev -- codex hook stop
```

## Stop Hook Runtime

新增 CLI：

```bash
cyrene codex hook stop
```

输入来自 stdin JSON。Phase B 只依赖这些字段的 best-effort 读取：

```ts
{
  cwd?: string,
  session_id?: string,
  turn_id?: string,
  transcript_path?: string | null,
  last_assistant_message?: string
}
```

缺失字段处理：

- `cwd` 缺失：使用 process cwd。
- `session_id` / `turn_id` 缺失：生成 hook-local run id。
- `transcript_path` 缺失或不可读：no-op。
- transcript JSONL 格式不认识：no-op。
- `last_assistant_message` 缺失：只依赖 transcript；仍可能 no-op。

Phase B 的 Stop hook 只捕获明确 durable signal，例如：

```txt
记住...
请记住...
以后默认...
之后默认...
以后你要...
from now on...
please remember...
remember that...
default to...
```

如果最近一轮没有明确 durable signal，hook no-op，不写 pending。

候选生成策略：

- 提取最近 user message 中的 durable instruction。
- 使用 short quote，最长 500 chars。
- evidence summary 描述来源，不保存完整 transcript。
- 默认 `source = "user_explicit"`。
- 默认偏向 `procedural/user_preference/project`，不自动生成 diagnostic affective memory。
- 无法安全分类时 no-op。

这不是 broad summarization。它只是 Stop hook 触发的保守 explicit-memory capture。

## Skill Update

更新 `cyrene-continuity` skill：

- 在用户明确要求“记住”“以后默认”“之后默认”“from now on”时，Codex 应优先调用 `cyrene_memory_propose`。
- 告诉 Codex：该 tool 只写 pending，不代表 memory 已正式生效。
- 不要求 Codex 每轮都调用 memory propose。
- 不要求 Codex 自行制造用户偏好。
- 不把 assistant proposal 当作 user preference。

## Doctor

`cyrene codex doctor` 增加 hook 状态提示：

```txt
codex:
  cyrene mcp: configured|missing
  agentmemory: disabled|enabled
  stop hook: configured|missing
  status: ready|not ready
```

Phase B readiness 不强制要求 Stop hook configured。原因：Stop hook 是 optional install；MCP propose tool 可以独立工作。

如果 Stop hook missing，doctor 输出 advisory，而不是 not ready：

```txt
advisory: optional Stop hook is not installed
```

## Safety

Phase B 的安全边界：

- `cyrene_memory_propose` 不可写 active memory。
- Stop hook 不保存完整 transcript。
- Stop hook 只处理 explicit durable signal。
- diagnostic affective claim reject。
- missing evidence reject。
- transcript parse failure no-op。
- hook timeout 需要短，避免阻塞 Codex Stop flow。
- hook output 应简短，避免污染 Codex UI。

## Tests

新增测试：

```txt
tests/codex-memory-propose.test.ts
tests/codex-hook-install.test.ts
tests/codex-hook-stop.test.ts
```

覆盖：

- valid candidate 写入 Codex project `pending.jsonl`。
- 缺少 evidence reject。
- diagnostic affective claim reject。
- validator 判定可 auto-write 的 high-confidence candidate 仍降级 pending。
- duplicate pending candidate merge `seenCount/evidence/tags`。
- `index.jsonl` 不被创建或修改。
- `events.jsonl` 记录 pending/reject。
- symlink memory root 仍拒绝。
- `cyrene_memory_propose` MCP tool 注册并返回 JSON text。
- `install-hook --stop --dry-run` 不写 `~/.codex/hooks.json`。
- `install-hook --stop` merge 到现有 hooks，不覆盖 sound hook。
- 重复 install 幂等。
- `cyrene codex hook stop` 可从 stdin JSON 读取 hook payload。
- transcript 缺失、不可读或格式不认识时 no-op。
- 最近 user message 有 explicit durable signal 时只写 pending。
- Stop hook runtime 不写 active memory。

## Verification

实现完成后运行：

```bash
npm run typecheck
npm test
npm run dev -- codex doctor
npm run dev -- codex install-hook --stop --dry-run
```

本机真实安装 Stop hook 前，应先确认 dry-run 输出会保留现有 `task_done_sound.sh` hook。

## Acceptance Criteria

```txt
[ ] npm run typecheck 通过
[ ] npm test 通过
[ ] cyrene_memory_propose 可以写 pending
[ ] high-confidence candidate 也不会写 active
[ ] install-hook --stop --dry-run 不写 hooks.json
[ ] install-hook --stop 不破坏已有 hooks
[ ] install-hook --stop 重复执行幂等
[ ] hook stop transcript 失败时 no-op
[ ] hook stop 成功时只写 pending
[ ] ~/.codex/hooks.json 只有用户显式 install-hook 时才会修改
[ ] pending memory 不进入 continuity_get context
```

## Later Phase C

Phase C/C+ 再考虑：

- broad turn summarization。
- stronger redaction。
- review UI。
- pending review/promote/delete workflow。
- UserPromptSubmit / SessionStart / PreToolUse hooks。
- full hook merge strategy for packaged plugin。

Phase B 不提前实现这些内容。
