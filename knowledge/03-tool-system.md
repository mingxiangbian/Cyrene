# Tool System — 工具系统架构

## 来源
- GitHub: Windy3f3f3f3f/how-claude-code-works (04-tool-system.md)
- GitHub: 777genius/claude-code-source-code-full
- GitHub: VILA-Lab/Dive-into-Claude-Code

---

## 工具规模

Claude Code 内置 **66+ 工具**，分为 7 大类：

| 类别 | 示例工具 | 数量 |
|------|---------|------|
| 文件操作 | Read, Write, Edit, GlobFind | ~8 |
| 网络 | WebFetch, WebSearch | ~3 |
| Agent 管理 | Task (AgentTool), TaskCreate, TaskUpdate | ~8 |
| 用户交互 | AskUserQuestion | ~2 |
| 系统 | Bash, Cron, ScheduleWakeup | ~6 |
| MCP 集成 | MCP 工具代理 | ~N |
| 协作 | TeamCreate, TeammateTool | ~5 |
| 模式控制 | EnterPlanMode, EnterWorktree | ~4 |
| Notebook | NotebookEdit | ~1 |

工具实现在 `src/tools/` 下约 **42 个子目录**中。

---

## 三层工具架构

### 1. 设计层 — `Tool<T>` 接口

每个工具是一个自包含模块，包含：
- Zod Schema 参数验证
- 权限模型声明
- 执行逻辑
- React UI 组件（终端渲染）

### 2. 组装层 — 工具池构建

```
getAllBaseTools() → getTools() → assembleToolPool()
```

工具按以下策略组装：
- 内置工具排前面（可缓存前缀）
- MCP 工具追加在后面（不可缓存后缀）
- Feature Flag 控制工具可见性

### 3. 执行层 — StreamingToolExecutor

- 并发执行引擎
- 基于 `isConcurrencySafe()` 调度
- 流式结果回传

---

## buildTool 工厂

每个工具通过 `buildTool` 工厂创建，默认值**保守**：

| 属性 | 默认值 | 含义 |
|------|--------|------|
| isConcurrencySafe | false | 不可与其他工具并发 |
| isReadOnly | false | 被视为写操作 |
| isDestructive | - | 是否破坏性 |
| needsUserInteraction | - | 是否需要用户交互 |

未声明的属性默认保守——"默认可写、不可并发"。

---

## 8 阶段工具执行生命周期

```
1. Lookup      — 按名称查找工具
2. Validation  — Zod Schema 验证参数
3. Parallel    — 同时启动 Hook + 分类器
   Launch
4. Permission  — 权限检查（deny-first 规则引擎）
   Check
5. Execution   — 实际执行工具逻辑
6. Result      — 结果处理、格式化
   Processing
7. Post-Hook   — 执行后 Hook（如日志记录）
8. Message     — 将结果作为消息发射到对话流
   Emission
```

---

## 工具三级分层（解决上下文混淆）

这是 Anthropic 的官方设计理念：

### 原子层（~20 个核心工具）
高频基础操作：Read, Write, Edit, Bash, Grep, Glob

### 沙箱工具层
不封装独立 Function Call，让 Agent 直接在 Bash 中调用预装程序：
- `ffmpeg`（视频处理）
- `jq`（JSON 处理）
- `ripgrep`（代码搜索）
- `gh`（GitHub CLI）

### 代码/包层
复杂串行逻辑 → Agent 直接写 Python 脚本一次性执行

---

## 关键安全约束

- **FileEditTool** 强制要求：编辑前必须先用 Read 工具读文件（系统层面硬约束，非 Prompt 软约束）
- 每个工具必须声明安全属性
- Hook 可在工具执行前后拦截
- Deny-first 规则引擎在权限检查阶段运行
