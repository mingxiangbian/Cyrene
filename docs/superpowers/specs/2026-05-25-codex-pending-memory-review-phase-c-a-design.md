# Codex Pending Memory Review Phase C-A Design

Ready for user review.

## 背景

Phase A 已完成本机 Codex global bridge，Codex 可以通过 Cyrene MCP 识别 project identity，并读取 compact continuity context。

Phase B 已完成 pending-only memory propose：

- `cyrene_memory_propose` 可以写入 Codex project 专属 `pending.jsonl`。
- optional Stop hook 可以在 Codex turn 结束后捕获明确 durable memory signal。
- pending memory 不进入 active memory，不进入 ordinary continuity context。

Phase C-A 的目标不是启用 broad turn summarization，也不是先做 Cyrene Web UI。目标是在 Codex 内建立 pending memory 的人工 review path：Codex 能看到待审批候选，用户能在 Codex 中 approve 或 reject，Cyrene 只有在明确 approve 后才把 pending promote 到 active。

## 决策

本阶段选择：

```txt
Codex-native chat review + MCP approve/reject tools + native elicitation capability spike
```

含义：

- 主路径是 Codex 聊天内 review，不依赖 Cyrene Web UI。
- CLI 只作为调试和救援路径，不作为主要 UX。
- MCP 新增 pending review tools，让 Codex 可以 list/get/promote/reject pending memory。
- 对“像工具权限一样弹出 approve/reject”的诉求先做 capability spike。只有确认 Codex app 支持 MCP elicitation 并能渲染合适 UI 后，才把它接入主路径。

必须明确的一点：Stop hook 在 assistant turn 结束后运行，不能像 tool permission 一样中断当前 assistant response。因此 Stop hook 生成的 pending memory 不能保证在同一轮原生弹窗；它应在下一次 Codex 有活动上下文时被 review surface 提醒。

## Goals

- 新增 Codex MCP pending review tools：

```txt
cyrene_memory_pending_list
cyrene_memory_pending_get
cyrene_memory_promote
cyrene_memory_reject
```

- `cyrene_memory_propose` 返回 pending 时，tool result 包含 compact review metadata，方便 Codex 在同一轮回复中提示用户 review。
- `cyrene_continuity_get` 增加非记忆化的 `pendingReview` metadata，用于提示“当前有待审批 memory”，但不把 pending 当作 active continuity memory 注入。
- 更新 `cyrene-continuity` skill：当发现 pending review item 时，在 Codex 聊天中展示候选并等待用户明确 approve/reject。
- Promote 必须只在用户明确批准后发生。
- Reject 必须从 pending pool 移除候选，并写入 audit event；用户拒绝的候选应避免立即反复出现。
- 做一个窄的 MCP elicitation spike，验证 Codex app 是否支持 structured approve/reject UI。

## Non-Goals

- 不做 broad transcript summarization。
- 不扩大 Stop hook 的自动总结范围。
- 不启用 pending 自动 promote。
- 不把 pending memory 当作 active memory 检索或注入 prompt。
- 不先做 Cyrene Web UI approve/reject 面板。
- 不把 CLI 设计成主审批体验。
- 不承诺 Codex 一定支持原生权限式弹窗。
- 不做 pending content edit flow；本阶段只支持 approve/reject。需要修改内容时，由 Codex 重新 propose 一条候选。
- 不做完整 redaction/review UI。更强 redaction 和 review surface 留给后续 Phase C-B/C-C。

## 用户体验

### 当前 turn 由 MCP propose 生成 pending

当 Codex 因用户明确指令调用 `cyrene_memory_propose` 后，如果结果是 `pending`，assistant 应在回复里展示：

```txt
生成了 1 条 pending memory：
<candidateId>
<content>

回复 approve 或 reject，我再写入最终决定。
```

用户回复 approve 后，Codex 调用 `cyrene_memory_promote`。用户回复 reject 后，Codex 调用 `cyrene_memory_reject`。

### Stop hook 在 turn 结束后生成 pending

Stop hook 不能在已经结束的 assistant response 里弹窗。它只能写 pending 和 audit event。

下一次 Codex 调用 `cyrene_continuity_get` 时，返回：

```ts
{
  pendingReview: {
    count: number,
    hasItems: boolean,
    newestCandidateId?: string,
    newestPreview?: string
  }
}
```

`pendingReview` 不是 active memory。它只是一个 review notice。`cyrene-continuity` skill 看到 `hasItems: true` 时，应先拉取 pending list/get，并用 Codex 聊天提示用户 approve/reject。

### 用户主动 review

用户可以直接说：

```txt
检查 pending memory
review pending memories
批准这条记忆
拒绝这条记忆
```

Codex 根据上下文调用 list/get/promote/reject。

## MCP Tool Contract

### `cyrene_memory_pending_list`

输入：

```ts
{
  cwd?: string,
  limit?: number
}
```

输出：

```ts
{
  project: {
    projectId: string,
    displayName: string
  },
  pending: Array<{
    id: string,
    domain: string,
    type: string,
    strength: string,
    scope: string,
    content: string,
    normalizedKey: string,
    source: string,
    seenCount: number,
    firstSeenAt: string,
    lastSeenAt: string,
    expiresAt?: string,
    reviewHash: string,
    evidenceSummary: string[],
    scores: {
      evidenceStrength: number,
      stability: number,
      usefulness: number,
      safety: number,
      sensitivity: number
    }
  }>,
  total: number
}
```

`reviewHash` 绑定候选的 id、content、normalizedKey、evidence、scores、lastSeenAt。它用于防止用户批准的是旧文本。

### `cyrene_memory_pending_get`

输入：

```ts
{
  cwd?: string,
  id: string
}
```

输出完整 pending candidate 和 `reviewHash`。

### `cyrene_memory_promote`

输入：

```ts
{
  cwd?: string,
  id: string,
  reviewHash: string,
  reason?: string
}
```

行为：

- 读取 pending candidate。
- 校验 `reviewHash`。
- 重新跑 validator 的安全检查，防止 stale 或被 tombstone 命中的候选进入 active。
- 将 pending candidate 转换为 active memory。
- 从 `pending.jsonl` 移除该候选。
- 写入 `events.jsonl` 的 `promote` event。
- 重新 render memory projections。

如果 `reviewHash` 不匹配，返回 conflict，并附上最新 candidate summary。Codex 应重新展示最新候选并再次请求用户确认。

### `cyrene_memory_reject`

输入：

```ts
{
  cwd?: string,
  id: string,
  reviewHash: string,
  reason?: string
}
```

行为：

- 读取 pending candidate。
- 校验 `reviewHash`。
- 从 `pending.jsonl` 移除该候选。
- 写入 `events.jsonl` 的 `reject` event。
- 写入 tombstone，避免同一 `normalizedKey` 立即反复回到 pending。

## Skill Behavior

更新 `integrations/codex/plugin/skills/cyrene-continuity/SKILL.md`：

- `cyrene_memory_propose` 仍是 pending-only。
- 如果 tool result 或 `cyrene_continuity_get` 显示有 pending review item，Codex 应把它作为“待审批候选”展示，而不是说“已经记住”。
- Codex 需要用户明确说 approve/批准/同意/保留，才调用 `cyrene_memory_promote`。
- Codex 需要用户明确说 reject/拒绝/删除/不要记，才调用 `cyrene_memory_reject`。
- 用户没有明确决定时，不 promote、不 reject。
- 如果有多条 pending，默认一次展示最多 3 条，避免刷屏；用户可以要求继续看下一批。

## Elicitation Spike

MCP SDK 当前提供 elicitation 能力，但 Phase C-A 不假设 Codex app 一定支持把它渲染成类似权限弹窗的原生 UI。

实施计划的第一步应做 capability spike：

1. 构造最小 MCP elicitation 调用，包含 approve/reject 两个结构化选择。
2. 在当前 Codex app 中手动触发。
3. 记录结果：
   - 支持：后续可把 pending review prompt 接入 elicitation。
   - 不支持：继续使用 Codex 聊天内 approve/reject。

即使 elicitation 支持，Stop hook 仍不能依赖它在 turn 结束后立刻弹窗；Stop hook path 仍通过下一次 Codex active context 来 surface review。

## Data Flow

```txt
user says "remember X"
  -> Codex calls cyrene_memory_propose
  -> pending.jsonl
  -> assistant displays pending review candidate
  -> user approves
  -> Codex calls cyrene_memory_promote
  -> index.jsonl + events.jsonl + projections
```

```txt
Codex Stop hook captures explicit durable signal
  -> pending.jsonl + events.jsonl
  -> next cyrene_continuity_get returns pendingReview metadata
  -> Codex calls pending list/get
  -> user approves or rejects in Codex chat
  -> promote/reject tool writes final state
```

## Error Handling

- Pending id not found：返回 `not_found`，Codex 告诉用户候选已不存在或已处理。
- `reviewHash` mismatch：返回 `conflict`，Codex 重新展示最新候选。
- Validator reject during promote：不写 active，返回 `rejected_by_validator` 和原因。
- Memory root unreadable：返回 typed error，不吞掉文件系统错误。
- Multiple matching candidates：list 展示 id，promote/reject 必须使用 exact id。

## Privacy And Safety

- Pending content 不作为 active memory 使用。
- `pendingReview` metadata 只表示“有候选待 review”，不改变 response strategy。
- list/get 暴露 pending content 是为了用户 review；Codex 必须以“候选”身份展示，不能把它当事实使用。
- Reject 写 tombstone，降低同一错误候选反复出现的概率。
- 本阶段不做完整 redaction，所以不扩大自动提取范围。

## Tests

新增或更新测试：

- `cyrene_memory_pending_list` 返回 pending summaries 和 stable `reviewHash`。
- `cyrene_memory_pending_get` 返回完整 candidate。
- `cyrene_memory_promote` 校验 hash、移除 pending、写 active、写 promote event、render projections。
- `cyrene_memory_reject` 校验 hash、移除 pending、写 reject event、写 tombstone。
- Hash mismatch 返回 conflict，不写 active，不删 pending。
- Promote 时 validator reject 会阻止 active write。
- `cyrene_continuity_get` 返回 `pendingReview` metadata，但 ordinary active memory context 不包含 pending content。
- `cyrene_memory_propose` pending result 包含 review metadata。
- Skill 文档明确：pending 不能说成已经记住。
- Elicitation spike 有手动验证记录；若 Codex app 不支持，fallback 到聊天内审批。

验证命令：

```bash
npm run typecheck
npm test
npm run dev -- codex doctor
git diff --check
```

## Manual Verification

Phase C-A 完成后，在 Codex 中验证：

1. 生成一条 pending memory。
2. 确认 Codex 显示 pending candidate，而不是说已经 active。
3. 回复 approve。
4. 确认 `cyrene_memory_promote` 后 active continuity 可以读到该 memory。
5. 再生成一条 pending memory。
6. 回复 reject。
7. 确认 pending 移除，active continuity 不包含该 memory。
8. Stop hook 生成 pending 后，开启下一次 Codex 交互，确认 review notice 出现。

## Future Work

- Phase C-B：更强 redaction 和 review-safe summarization。
- Phase C-C：如果 elicitation 在 Codex app 中可用，接入 native structured approve/reject。
- Phase C-D：更完整的 review UI 或 Web control console。
- Later：支持 edit-before-promote。

## Review Checklist

- [ ] Phase C-A 主路径是 Codex 内 review，不依赖 Web UI。
- [ ] Stop hook timing 限制已明确。
- [ ] Pending 不进入 active continuity context。
- [ ] Promote/reject 都需要用户明确决定。
- [ ] Native popup 只作为 capability spike，不作为无验证前提。
- [ ] Tests 覆盖 hash mismatch、reject、promote、pendingReview metadata。
