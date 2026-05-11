# Claude Code 架构总览

## 来源
- GitHub: [VILA-Lab/Dive-into-Claude-Code](https://github.com/VILA-Lab/Dive-into-Claude-Code)
- GitHub: [777genius/claude-code-source-code-full](https://github.com/777genius/claude-code-source-code-full)
- GitHub: [LDCRsddh/analysis_claude_code](https://github.com/LDCRsddh/analysis_claude_code)
- GitHub: [HZ0108/Inside-Claude-Code-Architecture-and-Design-Philosophy](https://github.com/HZ0108/Inside-Claude-Code-Architecture-and-Design-Philosophy)
- 51CTO: Claude Code 遭深度逆向工程
- AgiFlow: [Claude Code Internals: Reverse Engineering Prompt Augmentation Mechanisms](https://agiflow.io/blog/claude-code-internals-reverse-engineering-prompt-augmentation/)

---

## 技术栈

| 技术 | 用途 |
|------|------|
| TypeScript | 主语言 |
| Bun | 运行时（非 Node.js） |
| React + Ink | 终端 UI 渲染 |
| Commander.js | CLI 参数解析 |
| Zod | 工具参数验证 |

## 构建系统

使用 Bun `bun:bundle` 特性进行条件编译。已知的 Feature Flag：
- `PROACTIVE` — 主动模式
- `KAIROS` — 内部记忆系统
- `BRIDGE_MODE` — 远程桥接
- `DAEMON` — 守护进程
- `VOICE_MODE` — 语音模式
- `AGENT_TRIGGERS` — Agent 触发器
- `COORDINATOR_MODE` — 协调者模式
- `WORKFLOW_SCRIPTS` — 工作流脚本

---

## 六层分层架构

```
┌──────────────────────────────────────┐
│  入口层 (Entry)                       │
│  main.tsx → setup.ts 初始化环境       │
├──────────────────────────────────────┤
│  展示层 (Presentation)                │
│  React + Ink 终端 UI                  │
├──────────────────────────────────────┤
│  核心引擎 (Core Engine)               │
│  QueryEngine.ts (~46,000 行)          │
│  query.ts: Agent Loop                 │
├──────────────────────────────────────┤
│  执行层 (Execution)                   │
│  Tool System (66+ 工具)               │
│  Command System                       │
├──────────────────────────────────────┤
│  协作层 (Collaboration)               │
│  Sub-Agent 系统                       │
│  Agent Teams 系统                     │
│  远程桥接 (Bridge Mode)               │
├──────────────────────────────────────┤
│  管理层 (Management)                  │
│  权限系统 (7 种模式)                   │
│  配置管理                             │
│  状态管理 (React Context)             │
└──────────────────────────────────────┘
```

## 7 组件架构

1. **用户界面** — CLI / Headless / SDK / IDE 多种接入方式
2. **Agent Loop** — 核心 while 循环：模型调用 → 工具分发 → 结果收集 → 重复
3. **权限系统** — 7 种模式，deny-first 规则引擎
4. **工具系统** — 66+ 内置工具 + MCP 外部工具
5. **状态与持久化** — 文件系统存储，Markdown + YAML
6. **执行环境** — Bash 沙箱、Git Worktree 隔离
7. **上下文管理** — 5 阶段压缩管道

---

## 核心主链路

```
用户输入
  → processUserInput()
    → QueryEngine.submitMessage()
      → fetchSystemPromptParts() 组装 Prompt
        → query.ts 驱动主循环 (Agent Loop)
          → 工具系统执行
            → 结果渲染 (React + Ink)
```

## 核心设计哲学

1. **保持简单** — 避免 Multi-agent 复杂系统，只用主循环 + 扁平消息历史
2. **LLM 原生搜索而非 RAG** — 让 LLM 使用 ripgrep、jq、find 搜索代码库
3. **性价比策略** — 超过 50% 的调用使用更小模型（Haiku）处理大文件读取、网页解析等
4. **明确算法指导** — 为 LLM 的关键任务编写详细算法，包含决策点和启发式规则
5. **Deny-First 安全** — 默认拒绝，保守的权限模型

---

## 关键文件

| 文件 | 大小 | 职责 |
|------|------|------|
| src/QueryEngine.ts | ~46,000 行 | 流式 API 调用、工具分发循环、重试、压缩 |
| src/query.ts | - | Agent Loop 核心：消息准备、工具调用、结果回填 |
| src/utils/processUserInput/ | - | 输入预处理 |
| src/tools/ | ~42 子目录 | 所有工具的实现 |

## 并发模型

- 单线程事件循环（Bun）
- async/await 异步模式
- React Concurrent Rendering
- 工具并发安全：`isConcurrencySafe()` 接口
- StreamingToolExecutor：并发执行引擎，最大 10 个工具并发
