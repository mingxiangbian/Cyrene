# Tool Prompt Engineering — 工具描述即行为

## 来源
- GitHub: [Leonxlnx/agentic-ai-prompt-research](https://github.com/Leonxlnx/agentic-ai-prompt-research/blob/main/prompts/13_tool_prompts.md) — 从 Claude Code 提取的工具 Prompt
- GitHub: Piebald-AI/claude-code-system-prompts
- DeepWiki: anthropics/claude-code Tool System

---

## 核心原则

> **工具描述（Prompt）直接决定了 Agent 会不会用这个工具、何时用、怎么用。同样的代码实现，不同的 Prompt 会产生完全不同的 Agent 行为。**

---

## Bash Tool Prompt 完整解析

### 全文（~1,074 tokens）

```
Executes a given bash command and returns its output.

The working directory persists between commands, but shell state does not.
The shell environment is initialized from the user's profile (bash or zsh).

IMPORTANT: Avoid using this tool to run `find`, `grep`, `cat`, `head`, `tail`,
`sed`, `awk`, or `echo` commands, unless explicitly instructed or after you
have verified that a dedicated tool cannot accomplish your task.

Instead, use the appropriate dedicated tool:
- File search: Use Glob (NOT find or ls)
- Content search: Use Grep (NOT grep or rg)
- Read files: Use Read (NOT cat/head/tail)
- Edit files: Use Edit (NOT sed/awk)
- Write files: Use Write (NOT echo >/cat <<EOF)
- Communication: Output text directly (NOT echo/printf)
```

### 设计分析

| 设计要素 | 具体实现 | 目的 |
|---------|---------|------|
| 白名单替换表 | Bash 命令 → 专用工具的 1:1 映射 | 引导 LLM 使用更有结构的工具 |
| Git Safety Protocol | 完整的 Git 操作流程 | 防止误操作（reset --hard, push --force） |
| 超时设置 | 默认 120s, 最大 600s | 防止进程僵死 |
| 后台运行 | `run_in_background` 参数 | 长任务不阻塞 |
| 并行调用 | 独立命令并行发起 | 最大化效率 |
| 链式调用 | 依赖命令用 `&&` | 保证执行顺序 |
| HEREDOC 格式 | `git commit -m "$(cat <<'EOF' ... EOF)"` | 格式化保证 |

### 沙箱模式 Prompt 注入

当沙箱启用时，额外注入：
```
- Read deny-only lists
- Write allow-only lists
- Network allowed/denied hosts
- Temporary files must use $TMPDIR, not /tmp
```

---

## File Edit Tool Prompt 完整解析

```
Performs exact string replacements in files.

Usage:
- You must use your `Read` tool at least once in the conversation before editing.
  This tool will error if you attempt an edit without reading the file.
- When editing text from Read tool output, ensure you preserve the exact
  indentation (tabs/spaces).
- ALWAYS prefer editing existing files in the codebase. NEVER write new files
  unless explicitly required.
- Only use emojis if the user explicitly requests it.
- The edit will FAIL if `old_string` is not unique in the file.
  Either provide a larger string with more surrounding context to make it unique
  or use `replace_all` to change every instance of `old_string`.
- Use `replace_all` for replacing and renaming strings across the file.
```

### 关键设计要素

1. **硬约束声明** — "You must use Read tool at least once" — 这是系统层面的强制约束，不是建议
2. **失败模式预说明** — "The edit will FAIL if old_string is not unique" — 告诉 LLM 什么情况会失败以及如何解决
3. **默认行为引导** — "ALWAYS prefer editing existing files" — 用大写强调默认策略
4. **多义性处理** — 提供 `replace_all` 解决唯一性冲突

---

## Agent Tool Prompt（子 Agent 分发）

```
Launch a new agent to handle complex, multi-step tasks autonomously.

Usage notes:
- Always include a short description (3-5 words)
- Launch multiple agents concurrently whenever possible
- When the agent is done, it will return a single message back to you.
  The result is not visible to the user — send a text summary.
- You can optionally run agents in the background
- To continue a previously spawned agent, use SendMessage
- The agent's outputs should generally be trusted
- Clearly tell the agent whether you expect it to write code or just research
- You can optionally set `isolation: "worktree"`
```

### Fork Subagent 特性

```
## When to fork
Fork yourself when the intermediate tool output isn't worth keeping in context.
- Research: fork open-ended questions. Launch parallel forks in one message.
- Implementation: prefer to fork implementation work requiring more than a
  couple of edits.

Forks are cheap because they share your prompt cache.
Don't set `model` on a fork.
**Don't peek.** Do not Read or tail the output_file unless asked.
**Don't race.** Never fabricate or predict fork results.
```

---

## 工具 Prompt 的通用设计模式

### 1. 否定式约束（占~45%）
```
IMPORTANT: Avoid using...  (Bash)
NEVER write new files unless...  (Edit)
Do NOT use `--no-verify`...  (Git)
```
**目的**：LLM 天然偏向常见做法（如用 `grep` 而非专用工具），需要否定式约束纠正。

### 2. 失败预判
```
The edit will FAIL if...
This tool will error if...
```
**目的**：教 LLM 理解工具的失败边界，减少无效调用。

### 3. 替代方案提供
```
Instead, use the appropriate dedicated tool: ...
Either provide a larger string or use `replace_all`...
```
**目的**：不只是说"不要 X"，还说"应该用 Y"。

### 4. 上下文提示
```
The working directory persists between commands, but shell state does not.
```
**目的**：说明工具行为的跨调用状态（什么保持，什么不保持）。

### 5. 大写强调
```
IMPORTANT: ...
ALWAYS prefer...
NEVER write...
```
**目的**：在长 System Prompt 中抓住 LLM 的注意力。

---

## 对本地模型适配的启示

### 本地模型需要更精简的 Prompt

| Claude Code 原文 | 本地模型适配版 |
|-----------------|-------------|
| Bash: ~1,074 tokens | Bash: ~300 tokens（移除非关键场景） |
| TodoWrite: ~2,167 tokens | TodoWrite: ~500 tokens（保留核心规则） |
| Task: ~1,214 tokens | 可能根本不用子 Agent |

### 关键策略

1. **去大写化** — 本地模型对大写的关注度不如 Claude，改用结构化标记如 `<critical>...</critical>`
2. **减少否定式约束** — 本地模型理解"不要做 X"的能力较弱，改为正向引导
3. **缩短 Prompt** — 每个工具 Prompt 控制在 200-500 tokens
4. **测试驱动 Prompt 优化** — 写 Prompt → 跑 10 个测试场景 → 看成功率 → 调整 Prompt → 重复
5. **使用 few-shot 示例** — 本地模型比 Claude 更需要具体示例
