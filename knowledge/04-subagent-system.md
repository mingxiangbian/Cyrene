# Sub-Agent System — 子智能体委托系统

## 来源
- AgiFlow: Claude Code Internals: Reverse Engineering Prompt Augmentation Mechanisms
- HuggingFace: Context Engineering & Reuse Pattern Under the Hood of Claude Code
- PubNub: Best practices for Claude Code subagents
- Simon Willison: Anthropic: How we built our multi-agent research system
- CSDN: Claude Code Sub-agent 模式的详解和实践

---

## 核心概念

Claude Code 采用 **Main-Agent + Sub-Agent 主从架构**，这是 2025 年业界公认已收敛的 Agent 架构形态：

- **Main Agent（主智能体）**：负责核心任务调度与编排
- **Sub-Agent（子智能体）**：通过 `Task` 工具按需创建

### 关键设计特点

> 子 Agent 是**完全独立的对话**，拥有自己的系统提示和上下文窗口。不是线程分支，而是对话克隆。

---

## Sub-Agent 上下文隔离

从 AgiFlow 网络流量分析揭示的关键发现：

| 特性 | Main Agent | Sub-Agent |
|------|-----------|-----------|
| 系统提示 | 完整（~20K tokens） | 针对任务裁剪（子集） |
| 工具可用 | 全部工具（66+） | 受限工具（10/18） |
| 上下文 | 完整对话历史 | 仅收到委托提示 |
| CLAUDE.md | 自动加载 | 自动加载（项目级标准） |
| 递归 | — | 不可递归创建子 Agent |

### 上下文隔离的优缺点

**优点**：
- 子任务执行过程不污染主 Agent 上下文
- 完成后只返回摘要结果，极大压缩上下文
- 可以并行运行多个独立探索任务

**缺点**：
- 子 Agent 无法引用主对话中的历史信息
- 需要显式传递所有必要上下文
- 委托提示需要非常详细

---

## 6 种内置 Sub-Agent 类型

| 类型 | 用途 |
|------|------|
| Explore | 快速只读代码搜索和定位（有独立 Agent 定义） |
| Plan | 软件架构设计、实现计划（有独立 Agent 定义） |
| general-purpose | 通用多步骤任务（默认类型） |
| claude-code-guide | Claude Code 功能使用问答 |
| statusline-setup | 状态栏配置 |
| code-reviewer | 代码审查（社区常用） |

---

## SkillTool vs AgentTool

| 维度 | SkillTool | AgentTool (Task) |
|------|-----------|-----------------|
| 机制 | 上下文注入 | 隔离上下文窗口 |
| 工具 | 使用主 Agent 工具 | 独立的工具子集 |
| 成本 | 低（仅注入文本） | 高（独立 API 调用） |
| 适用 | 流程引导、规范约束 | 独立任务执行 |

---

## 3 种隔离模式

1. **Worktree** — 创建临时 Git 工作树，文件系统隔离
2. **Remote** — 远程执行（Bridge Mode）
3. **In-process** — 进程内执行（默认）

---

## 真实执行流程（SWE-bench 追踪）

来自 HuggingFace 的深度追踪，一次 Bug 修复任务的实际执行：

```
1. 预热阶段（Trace #2-#4）
   → 工具列表 + Explore/Plan 系统提示预加载
   → 目的：填充 KV Cache

2. Main Agent（#6）
   → 接收完整系统提示（~20K tokens）
   → 包含 git 历史、18 个工具规格

3. 并行 Explore Sub-Agents（#7-#45）
   → 3 个 Explore Agent 并行运行
   → 各自独立的 ReAct 循环
   → 只返回摘要给 Main Agent

4. Plan Sub-Agent（#47-#72）
   → 仅接收 Explore Agent 的摘要
   → 在隔离环境中设计方案

5. Main Agent 执行（#77-#91）
   → 使用 Plan 的输出作为 TODO 列表
   → 逐项执行并标记完成
```

### 统计数据
- 总共 **92 次 LLM 调用**
- 消耗约 **200 万 input tokens**
- 耗时约 **13 分钟**
- 前缀缓存复用率 **92-98%**
- 实际成本降低 ~81%

---

## Sub-Agent 的局限

1. **不可递归** — 子 Agent 不能再创建子 Agent（防止无限递归）
2. **无直接通信** — 子 Agent 之间不直接通信，必须通过主 Agent 中转
3. **上下文丢失** — 子 Agent 看不到主对话历史
4. **单层深度** — 最多只有一个分支深度

这些局限是**刻意设计的**，确保 Agent 始终关注最终目标，避免陷入无限递归或上下文失控。
