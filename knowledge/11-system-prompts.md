# Claude Code System Prompts — 系统提示工程

## 来源
- GitHub: [Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts) — 持续追踪 56+ 版本
- GitHub: [jujumilk3/leaked-system-prompts Issue #116](https://github.com/jujumilk3/leaked-system-prompts/issues/116)
- [Vibe Sparking: System Prompts Revealed](https://www.vibesparking.com/en/blog/ai/anthropic/claude-code/2025-12-21-claude-code-system-prompts-revealed/)
- GitHub: [Piebald-AI/tweakcc](https://github.com/Piebald-AI/tweakcc) — 自定义 System Prompt 的工具

---

## 核心发现

> Claude Code 不是单一 System Prompt，而是 **42 个独立 Prompt 组件**动态组装而成。

### Prompt 分类（v2.1.88）

| 类别 | 数量 | 总大小 | 关键内容 |
|------|------|--------|---------|
| Tool Prompts | 16 | 36.8 KB | 每个工具的指令和约束 |
| Other (模板/配置) | 11 | 7.1 KB | 辅助功能 |
| Unclassified | 9 | 5.0 KB | 杂项 |
| Instruction | 4 | 1.2 KB | 行为指令 |
| System (Core) | 1 | 94 B | 核心身份 |
| Error | 1 | 2.7 KB | 错误处理 |

---

## 主 System Prompt 要点（~2,981 tokens）

```
You are Claude Code, Anthropic's official CLI for Claude.
[身份定义]
You are an interactive agent that helps users with software engineering tasks.
[核心功能]
- Output text to communicate with the user.
- Use Github-flavored markdown.
- Avoid emojis unless user requests.
- Responses should be short and concise.

IMPORTANT: Security constraints...
[安全约束]
IMPORTANT: Claude Code is available as a CLI, desktop app, web app, IDE extensions.
IMPORTANT: You must NEVER generate or guess URLs.
```

### 设计原则

1. **简短精炼** — 命令行风格的输出，1-3 句回答
2. **GitHub-flavored Markdown** — 为等宽字体优化
3. **无 Emoji** — 除非用户要求
4. **工具优先** — 用工具完成任务，不要用文字代替
5. **技术准确性** — 提供直接、客观的技术信息
6. **读后再改** — 修改文件前必须先读取
7. **避免过度工程** — 不添加不必要的抽象

---

## Top 10 最大 System Prompts

| Prompt ID | 大小 | 功能 | 为什么重要 |
|-----------|------|------|-----------|
| `prompt_sym_Ue5_23` | 10.8 KB | Security Review | 三阶段安全审查框架 |
| `prompt_sym_LHB_32` | 9.7 KB | TodoWrite | 任务管理的最佳实践 |
| `prompt_sym_qL6_0` | 6.1 KB | Git Commit & PR | 完整的 Git 工作流指令 |
| `prompt_sym_qpA_11` | 5.1 KB | Session Summary | 对话总结生成 |
| `prompt_sym_ve5_6` | 5.0 KB | Agent Architect | Agent 创建器/元 Agent |
| `prompt_sym_la2_7` | 4.3 KB | MCP CLI | MCP 服务器指令 |
| `prompt_sym_BfQ_24` | 4.0 KB | Task (Subagent) | 子 Agent 启动指令 |
| `prompt_sym_sEQ_12` | 3.7 KB | Bash | Shell 安全协议 |
| `prompt_sym_Ws2_28` | 2.7 KB | Bash Output Analyzer | 命令输出的错误分析 |
| `prompt_sym_f2I_18` | 3.4 KB | Notes Update | 笔记/记忆更新 |

---

## 子 Agent 的独立 System Prompts

| Agent | Tokens | 核心内容 |
|-------|--------|---------|
| **Explore** | 516 | 快速只读代码搜索 |
| **Plan Mode** | 633 | 实现计划设计 |
| **Task Tool** | 294 | 通用子 Agent 分发 |
| **Agent Architect** | 1,111 | 创建自定义 Agent |
| **CLAUDE.md Generator** | 384 | 分析代码库生成文档 |
| **Status Line Setup** | 1,310 | 状态栏配置 |
| **Claude Guide** | 763 | 帮助用户理解 Claude Code |
| **WebFetch Summarizer** | 185 | 总结网页内容 |

---

## 工具 Prompt 的大小差异

| 工具 | Tokens | 复杂度 |
|------|--------|--------|
| TodoWrite | 2,167 | 最复杂（任务管理最佳实践） |
| Task (Agent) | 1,214 | 子 Agent 分发 |
| Bash | 1,074 | Shell 安全协议 |
| EnterPlanMode | 970 | 计划模式 |
| Bash Prefix Detection | 835 | 命令注入检测 |
| ReadFile | 439 | 文件读取 + 多模态 |
| Grep | 300 | 内容搜索 |
| Edit | 278 | 文件编辑 |
| Session Title | 333 | 标题生成 |
| Write | 159 | 最简单的工具 |

---

## 对本地模型适配的核心启示

### 1. Prompt 长度直接影响行为
- TodoWrite 有 2,167 tokens 的指令 → 任务管理行为非常具体
- Write 只有 159 tokens → 创建文件的逻辑很简单
- **本地模型适配**：小模型可能无法消化 2000+ token 的工具描述

### 2. 安全约束写在 Prompt 里，不是代码里
Claude Code 大量使用 "IMPORTANT:" 标记嵌入行为约束：
```
IMPORTANT: You must NEVER generate or guess URLs.
IMPORTANT: Avoid using this tool to run `find`, `grep`...
IMPORTANT: Never skip hooks (--no-verify) unless explicitly asked.
```

### 3. 工具描述决定了 Agent 的行为模式
同一个代码库，工具描述不同，Agent 行为完全不同。45% 的工具 Prompt 包含否定式约束（"不要做 X"）。

### 4. Prompt 的"版本漂移"
56+ 版本中，每次更新都会微调 Prompt。关键变化例子：
- v2.0.75: 移除了 "不要使用冒号在工具调用前" 的指令
- v2.0.74: 移除了委派模式限制
- v2.0.62: 重写了 EnterPlanMode — 从被动到主动规划

---

## 可自定义的 tweakcc 工具

[Piebald-AI/tweakcc](https://github.com/Piebald-AI/tweakcc) 允许：
- 将每个 System Prompt 片段提取为独立 Markdown 文件
- 自定义修改后 Patch 到本地安装的 Claude Code
- 管理 Anthropic 更新与自定义修改的冲突

这对本地模型适配非常有价值——你可以直接修改工具描述来适配本地模型的能力边界。
