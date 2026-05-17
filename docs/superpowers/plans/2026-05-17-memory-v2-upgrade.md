# Memory System v2 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。

**目标：** 将记忆系统升级为"自动记录 + 统一记忆管道 + 跨项目作用域 + 容量管理"

**架构：** 新增 `daily-logger.ts`（regex 提取 + 日记忆追加），扩展 `memory.ts`（soul/向上递归/日记忆加载/容量整理），修改 `main.ts`/`repl.ts`启动和退出流程，废弃 `sessions/`

---

### 任务 1：Config — 新增记忆相关配置项

**文件：** `src/config.ts`

**做什么：** 新增 5 个配置项并设默认值

- `userMemoryDir: string` — 默认 `~/.cc-local/memory`
- `dailyCompactThreshold: number` — 默认 500（daily.md 触发整理的行数阈值）
- `dailyLoadLines: number` — 默认 200（启动时加载 daily.md 最近行数）
- `memoryMaxLines: number` — 默认 200（MEMORY.md 行数上限）
- `memoryMaxLineLength: number` — 默认 150（MEMORY.md 每行字符上限）

已有 `autoCompactThreshold`、`contextWindowTokens` 等不变。

**测试要点：** 默认值断言

Commit: `feat: add memory v2 config fields`

---

### 任务 2：Daily Logger — regex 提取 + 日记忆追加

**文件：** 创建 `src/daily-logger.ts`、`tests/daily-logger.test.ts`

**做什么：** 从工具调用结果中提取机械事实，追加到 `memory/daily.md`

- `extractFactFromToolCall(toolName, toolArgs, result): string | null`
  - bash → 提取 exit code、命令摘要
  - file_edit → 提取文件路径、变更描述
  - file_write → 提取文件路径
  - 其他工具 → 提取工具名 + ok/error 状态
  - 返回一行 `[HH:MM] {tool} → {summary}` 或 null（无值得记录的事实）
- `extractFactsFromTurn(messages): string[]` — 对一轮消息批量提取
- `appendDaily(cwd, chunks): Promise<void>` — 追加到 `memory/daily.md`（自动创建目录）

纯正则匹配，不调 LLM。

**关键约束：** 
- 必须创建 `.cc-local/memory/` 目录（如不存在）
- 写入使用 `flag: 'a'` 追加模式
- 每个事实一行，以时间戳开头

**测试要点：** bash 成功/失败提取、file_edit 提取、file_write 提取、无关工具返回 null、目录不存在时自动创建、appendDaily 追加不覆盖

Commit: `feat: add daily-logger for regex-based fact extraction`

---

### 任务 3：Agent Loop — PostToolUse 后自动记录日记忆

**文件：** `src/agent-loop.ts`、`tests/agent-loop.test.ts`

**做什么：** 在工具调用执行完成后调 daily-logger 记录事实

- 在 `runAgentLoop` 的工具分发循环中，每个工具执行完成后调 `extractFactFromToolCall`
- 将本轮所有事实收集为数组
- 本轮结束后调 `appendDaily(cwd, facts)`
- REPL 模式下同步生效（agent-loop 被 REPL 复用）

**关键约束：** 日记忆写入失败不能阻断 agent 正常工作（try/catch + 静默忽略）

**测试要点：** 模拟工具调用后 daily.md 被追加、写入失败不影响 agent 响应

Commit: `feat: wire daily-logger into agent-loop after tool calls`

---

### 任务 4：Memory — soul.md + 向上递归 CLAUDE.md

**文件：** `src/memory.ts`、`tests/memory-load.test.ts`

**做什么：** 扩展 memory.ts 增加两个加载函数

- `loadSoul(cwd): Promise<string>` — 读 `.cc-local/soul.md`，冠以 `## Agent Persona`。文件不存在返回空字符串
- `loadUpwardClaude(cwd): Promise<string>` — 从 cwd 向上遍历到 `~`，每层目录读 `CLAUDE.md`。停止条件：到达 `~` 或文件不存在于当前层。每层内容冠以所在目录路径
- 停止条件：`os.homedir()` 为终界

**关键约束：** 路径穿越安全 — 只停留在 home 以内；文件不存在是正常情况，不抛错

**测试要点：** soul.md 存在/不存在、单层 CLAUDE.md、多层递归、到 ~ 停止、空文件返回空字符串

Commit: `feat: add loadSoul and loadUpwardClaude`

---

### 任务 5：Memory — loadDaily + 双作用域 loadMemories

**文件：** `src/memory.ts`、`tests/memory-load.test.ts`

**做什么：**

- `loadDaily(cwd, lines): Promise<string>` — 加载 `memory/daily.md` 最近 N 行（用 `tail -n` 或逐行读取后截取）。不存在则返回空字符串
- 修改 `loadMemories` 签名，增加用户级记忆目录参数 `loadMemories(cwd, userMemoryDir?)`
  - 先加载项目级 `project/.cc-local/memory/`
  - 再加载用户级 `~/.cc-local/memory/`
  - 两级内容合并在一起返回（用户级冠以前缀标记 `## Global Memory`）
- `appendDaily` 也支持双路径 — 项目级 daily.md 和全局 daily.md 分开追加

**关键约束：** 用户级记忆目录可能因权限等原因不存在，所有 IO 错误静默回退

**测试要点：** daily.md 存在/不存在/少于 N 行、双作用域同时存在时内容合并、用户级缺失时正常回退

Commit: `feat: add loadDaily and dual-scope memory loading`

---

### 任务 6：Memory — 容量限制 + compactMemories 整理

**文件：** `src/memory.ts`、`tests/memory-load.test.ts`

**做什么：**

- 修改 `updateMemoryIndex` — 追加前检查 MEMORY.md 行数和每行长度
  - 行数 ≥ `memoryMaxLines` → 返回错误 `MEMORY.md is full`
  - 行长度 > `memoryMaxLineLength` → 截断或返回错误
- `compactMemories(cwd, dailyContent): Promise<string>` — LLM 整理 daily.md
  - 输入：daily.md 原始内容
  - 输出：整理后的 MEMORY.md 新增条目（标题 + 文件 + 摘要格式）
  - 内部流程：用 LLM 分析 daily 内容 → 合并重复 → 标记过时 → 生成可晋升条目 → 逐条调用 `updateMemoryIndex`
- 这些函数接受 `callModel` 参数（依赖注入，不用内部 import）

**关键约束：** compactMemories 需要 LLM 调用但做的是"编辑工作"（合并/去重/晋升），不做"推理工作"（理解对话）。Prompt 设计为结构化编辑任务。

**测试要点：** 超限时写返回错误、超限时列出当前条目、compactMemories mock LLM 返回整理结果、整理后 MEMORY.md 正常更新

Commit: `feat: add capacity limits and compactMemories`

---

### 任务 7：REPL — 退出流程改为日记忆整理

**文件：** `src/repl.ts`、`tests/repl.test.ts`

**做什么：** 改写 REPL 退出逻辑

- 移除 `buildSessionSummaryPrompt` 和 `saveSessionSummary` 中的会话摘要逻辑
- 退出时检查 `memory/daily.md` 行数
  - ≥ `dailyCompactThreshold` → 调 `compactMemories` 整理 → 晋升到 MEMORY.md
  - < 阈值 → 跳过，daily.md 原样保留
- `loadRecentSummaries` 调用改为 `loadDaily` 调用
- `buildSessionSummaryPrompt` 保留但改名/重定向为整理 Prompt（给 compactMemories 用）

**关键约束：** 整理失败不影响退出；原 session 摘要文件不删除（已有历史数据保留）

**测试要点：** 达到阈值触发整理、未达阈值跳过、整理结果写入 MEMORY.md、整理失败静默回退

Commit: `feat: replace session summary with daily compact on REPL exit`

---

### 任务 8：Main — 启动时加载所有记忆层

**文件：** `src/main.ts`

**做什么：** 改写启动时的 system prompt 组装顺序

新拼接顺序：
```
soul (loadSoul)
  → 全局 CLAUDE.md (~/.cc-local/CLAUDE.md)
  → 向上递归 CLAUDE.md (loadUpwardClaude)
  → 项目 instructions.md
  → 项目 memory (loadMemories project)
  → 全局 memory (loadMemories user)
  → daily.md 最近 200 行 (loadDaily)
  → tool definitions
```

移除 `loadRecentSummaries` 调用。

**测试要点：** 依赖已有测试(main-cli.test.ts)验证 system prompt 拼接、新增层不存在时不影响启动

Commit: `feat: assemble full memory stack on startup`

---

### 任务 9：集成测试 — 端到端记忆生命周期

**文件：** 创建 `tests/memory-v2-integration.test.ts`

**做什么：** 串起完整流程测试

- 模拟多轮对话 → 验证 daily.md 被追加
- 触发 daily.md 超阈值 → 验证 compactMemories 被调用
- MEMORY.md 超限 → 验证写返回错误
- 双作用域 → 验证项目 + 全局记忆均被加载

**测试要点：** 完整生命周期不报错、daily.md 内容正确、MEMORY.md 内容正确、跨作用域合并正确

Commit: `test: add memory v2 end-to-end integration tests`

---

### 任务 10：最终验证

- 全部测试通过
- 类型检查通过
- 手动 `--repl` 验证 daily.md 生成

---

## 变更总结

| 文件 | 变更 | 内容 |
|------|------|------|
| `src/config.ts` | 修改 | +5 个记忆配置项 |
| `src/daily-logger.ts` | 创建 | regex 提取 + daily.md 追加 |
| `src/memory.ts` | 修改 | +4 个加载函数 + 容量限制 + 整理 |
| `src/agent-loop.ts` | 修改 | PostToolUse 后调用 daily-logger |
| `src/repl.ts` | 修改 | 退出流程改为日记忆整理 |
| `src/main.ts` | 修改 | 启动时加载完整记忆层 |
| `tests/daily-logger.test.ts` | 创建 | regex 提取测试 |
| `tests/memory-v2-integration.test.ts` | 创建 | 端到端记忆生命周期 |
| `tests/memory-load.test.ts` | 修改 | soul/递归/日记忆/双作用域测试 |
| `tests/agent-loop.test.ts` | 修改 | 日记忆记录测试 |
| `tests/repl.test.ts` | 修改 | 退出整理测试 |
