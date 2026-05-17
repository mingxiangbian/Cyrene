# Context Compression 升级 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。

**目标：** 为 cc-local 增加 Snip / Microcompact / Context Collapse 三个程序化压缩阶段，对标 Claude Code 的 5 阶段压缩管道

**架构：** 在 `context.ts` 新增 3 个纯函数，在 `agent-loop.ts` 和 `repl.ts` 中按阈值依次调用，所有阶段在 LLM 参与之前执行

**关键约束：**
- 所有压缩函数必须返回合法 `ChatMessage[]`，不能留下带 `tool_calls` 但缺少对应 `tool` 结果的 assistant 消息。
- `agent-loop.ts` 中的 `messages` 数组可能由 REPL 调用方传入；压缩后必须用 `messages.splice(0, messages.length, ...nextMessages)` 原地替换，不能改成重新赋值。
- 每个压缩阶段执行后都要重新估算 token，再决定是否进入下一阶段。
- REPL 摘要压缩必须在副本上执行，不能修改真实 session history。

---

### 任务 1：Config — 新增阈值和轮次配置

**文件：** `src/config.ts`

新增 5 个配置项：
- `snipThreshold` = 0.4（窗口 40% 触发）
- `microcompactThreshold` = 0.5（50% 触发）
- `collapseThreshold` = 0.6（60% 触发）
- `snipKeepRounds` = 15（Snip 保留最近 N 轮）
- `microcompactKeepRecentRounds` = 5（Microcompact 保留最近 N 轮的 tool 原文）

Commit: `feat: add snip/microcompact/collapse thresholds and round configs`

---

### 任务 2：snipMessages — 裁掉旧的非关键消息

**文件：** `src/context.ts`（新增导出），`tests/context-compression.test.ts`（创建）

**行为：** 纯函数，输入 `ChatMessage[]` + `keepRecentRounds`，返回过滤后的副本。此函数不需要知道阈值；调用方只在超过阈值时调用。

- 以 `role: 'user'` 为轮次边界，保留最近 N 轮不动
- 旧轮次中：`system` 保留，`user` 保留，有 text content 的 `assistant` 保留
- 旧轮次中：无 text content、仅有 `tool_calls` 的 `assistant` 及其后续对应 `tool` 消息整组删除
- 旧轮次中：如果 `assistant` 同时有 text content 和 `tool_calls`，保留 text content，但返回的消息必须移除 `tool_calls`，并删除对应 `tool` 消息，避免产生非法工具调用链

**测试要点：** 旧轮次 tool 链被整组移除、assistant text 保留但 tool_calls 清除、user 消息始终保留、保留最近 N 轮原文、返回值不复用输入数组

Commit: `feat: add snipMessages to remove old non-essential messages`

---

### 任务 3：microcompactToolResults — 截断旧轮次工具输出

**文件：** `src/context.ts`（新增导出），`tests/context-compression.test.ts`（追加）

**行为：** 纯函数，保留最近 N 轮的 tool 消息原文，更早的 tool 消息内容替换为一行索引 `[tool: {name} - output truncated ({N} chars)]`。不删除消息，必须保留 `role: 'tool'` 和 `tool_call_id`，从而保持工具调用链完整。

工具名通过向前查找对应 assistant 消息的 `tool_calls` 数组解析。

**测试要点：** 旧 tool 输出变为一行摘要、`tool_call_id` 保留、工具名可从对应 assistant 解析、最近 N 轮 tool 不截断、返回值不复用输入数组

Commit: `feat: add microcompactToolResults to truncate old tool outputs`

---

### 任务 4：collapseConsecutiveCalls — 合并连续同类型工具调用

**文件：** `src/context.ts`（新增导出），`tests/context-compression.test.ts`（追加）

**行为：** 纯函数，扫描连续同类型 tool 调用组（被无 content 的 assistant 消息连接视为连续），达到阈值时将整组 assistant/tool 消息替换为一条普通 `assistant` 摘要消息。摘要消息不得包含 `tool_calls` 或 `tool_call_id`。

合并阈值：`grep`/`web_search`/`file_read` ≥ 3 次，`bash` ≥ 2 次，其他工具 ≥ 4 次。合并后保留每条结果的前 200 字符预览。

**关键约束：** user 消息或有 text content 的 assistant 消息会中断连续组，不同类型的工具不合并。

**测试要点：** 3 次 grep 合并、2 次 bash 合并、user 消息隔断不合并、不同工具不合并、单次调用不合并、合并后没有断裂的 tool_call_id/tool_calls

Commit: `feat: add collapseConsecutiveCalls to merge consecutive same-type tool calls`

---

### 任务 5：Agent Loop — LLM 调用前按阈值依次执行

**文件：** `src/agent-loop.ts`

在 `while` 循环中，每次 `callModel` 之前：

1. 计算当前 token 估算值
2. ≥40% → 执行 `snipMessages`，用 `messages.splice(0, messages.length, ...nextMessages)` 原地替换
3. 重新估算 token；≥50% → 执行 `microcompactToolResults`，原地替换
4. 重新估算 token；≥60% → 执行 `collapseConsecutiveCalls`，原地替换
5. ≥70% → 执行 `compactHistory`（已有 Auto-Compact 逻辑）

关键改动：抽出小辅助函数 `replaceMessages(messages, nextMessages)`，统一保持数组引用；不要把 `messages` 改成 `let` 并重新赋值。Auto-Compact 现有的 unchanged signature guard 继续保留。

Commit: `feat: wire snip/microcompact/collapse stages before auto-compact`

---

### 任务 6：REPL — 退出摘要前对副本执行三阶段清理

**文件：** `src/repl.ts`

修改 `buildSessionSummaryPrompt` 签名为 `buildSessionSummaryPrompt(messages: ChatMessage[], config: AppConfig)`：在构建 prompt 文本之前，对非 system 消息副本依次执行 `snipMessages` → `microcompactToolResults` → `collapseConsecutiveCalls`。清理后的精简消息再拼接为 prompt 字符串发给 LLM。

`saveReplSessionSummary` 调用处需要传入 `config`。测试中的直接调用也要更新。所有清理只作用于副本，不修改传入的 `messages`。

Commit: `feat: apply compression stages before REPL session summary prompt`

---

### 任务 7：最终验证

- 全部测试通过
- 类型检查通过
- 确认所有变更已提交

---

## 变更总结

| 文件 | 变更 | 内容 |
|------|------|------|
| `src/config.ts` | 修改 | +5 个配置项 |
| `src/context.ts` | 修改 | +3 个纯函数 + 4 个私有辅助函数 |
| `src/agent-loop.ts` | 修改 | LLM 调用前按阈值依次执行三阶段 |
| `src/repl.ts` | 修改 | 退出摘要前对副本执行三阶段清理 |
| `tests/context-compression.test.ts` | 创建 | 3 个函数各 3-5 个测试用例 |
