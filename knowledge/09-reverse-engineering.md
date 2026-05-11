# Reverse Engineering — 逆向工程发现

## 来源
- GitHub: LDCRsddh/analysis_claude_code（v1.0.33 完整逆向）
- GitHub: ThreeFish-AI/analysis_claude_code
- GitHub: DBinK/analysis_claude_code
- 51CTO: Claude Code 遭深度逆向工程！AI 编程智能体核心架构设计曝光
- AgiFlow: Claude Code Internals: Reverse Engineering Prompt Augmentation Mechanisms
- 知乎: Anthropic的Claude Code Agent效果很好，有没有人深入分析其技术原理？
- 即刻: 这几个月对Claude Code的逆向、架构分析的博客很多

---

## 逆向工程背景

Claude Code 是**闭源商业软件**，但 npm 包中包含了 Source Map，使得社区可以还原混淆后的 TypeScript 源码。

### 关键事件时间线

| 时间 | 事件 |
|------|------|
| 2025.06 | ShareAI-Lab 发布首个完整逆向分析（v1.0.33，5 万行混淆代码） |
| 2025.08 | AgiFlow 通过网络流量分析发现 5 个 Prompt 注入点 |
| 2025.09 | 多个逆向仓库出现（LDCRsddh, ThreeFish-AI, DBinK） |
| 2025.10 | 51CTO 报道"Claude Code 遭深度逆向工程" |
| 2025.11 | 社区讨论：逆向分析验证准确率达 95% |

---

## 5 层子系统分解

逆向工程揭示了 21 个子系统，组织为 5 层：

### Surface Layer（表层）
- UI 渲染 (React + Ink)
- 输入处理
- CLI 参数解析

### Core Layer（核心层）
- Agent Loop 引擎 (nO)
- 消息队列 (h2A)
- 上下文压缩器 (wU2)
- 流式 API 客户端

### Safety/Action Layer（安全/执行层）
- 工具引擎 (MH1) — 6 阶段管道
- 并发调度器 (UH1) — 最大 10 并发
- 权限引擎 — 7 模式 deny-first
- Hook 系统 — 确定性拦截

### State Layer（状态层）
- React Context + 自定义 Store
- AppState 全局可变状态
- Context Providers + Selectors
- Change Observers

### Backend Layer（后端层）
- Bun 运行时
- 文件系统操作
- Git 集成
- MCP 客户端

---

## 核心组件反混淆映射

| 混淆名 | 推测原名 | 功能 |
|--------|---------|------|
| nO | AgentLoop | 主循环引擎 |
| h2A | MessageQueue | 双缓冲消息队列 |
| wU2 | ContextCompressor | 上下文压缩 |
| MH1 | ToolEngine | 工具执行引擎 |
| UH1 | ConcurrencyScheduler | 并发调度器 |

---

## Agent Loop 详细设计

### AsyncGenerator 模式
Agent Loop 使用 JavaScript 的 AsyncGenerator 实现，支持：
- `yield` 暂停/恢复
- 中断信号传播
- 流式数据管道

### 状态机
```
IDLE → PREPARING → WAITING_FOR_LLM → DISPATCHING_TOOLS
  → WAITING_FOR_TOOLS → COLLECTING_RESULTS → CHECKING_DONE
    → IDLE (循环) or COMPLETED
```

### 中断与恢复
- Ctrl+C 发出中断信号
- Loop 在当前工具执行完成后检查中断标志
- 保存状态后可恢复

---

## 工具系统逆向发现

### 工具分类（实际代码中的分类）
1. **BashTool** — Shell 命令执行（最复杂，包含沙箱逻辑）
2. **FileEditTool** — 精确字符串替换（强制 Read-before-Edit）
3. **MultiFileEditTool** — 批量文件编辑
4. **GrepTool** — 代码搜索
5. **GlobTool** — 文件匹配
6. **TaskTool** — 子 Agent 委托
7. **AskUserQuestionTool** — 用户交互
8. **WebSearchTool / WebFetchTool** — 网络访问
9. **MCPTool** — 外部工具代理
10. **NotebookEditTool** — Jupyter Notebook 编辑

### 工具注册
```typescript
// 每个工具是一个自包含模块
{
  name: "Bash",
  description: "...",
  schema: z.object({...}),
  prompt: "Git Safety Protocol...",
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  async *call(params) { ... }
}
```

---

## 5 个 Prompt 注入点（网络流量分析）

AgiFlow 通过拦截 API 请求发现：

```json
{
  "model": "claude-sonnet-4-6",
  "system": [
    { "type": "text", "text": "<base system prompt>" },
    { "type": "text", "text": "<CLAUDE.md injected here>" },
    { "type": "text", "text": "<output style injected here>" },
    { "type": "text", "text": "<tool definitions>", "cache_control": {"type": "ephemeral"} }
  ],
  "messages": [
    { "role": "user", "content": "<slash command message>" },
    { "role": "user", "content": "<skill content via tool_result>" },
    { "role": "user", "content": "<user input>" }
  ],
  "tools": [...]
}
```

### cache_control 定位
- `cache_control: { type: "ephemeral" }` 标记放在系统提示和工具定义的**静态部分**
- 对话历史**不标记**缓存
- 这是成本优化的关键设计

---

## 逆向分析准确率

社区多个独立逆向分析的交叉验证表明：
- 核心架构分析准确率约 **95%**
- 混淆变量名推测准确率约 **80%**
- 边缘功能（Voice Mode、Coordinator Mode）准确率较低（~60%）

所有逆向分析都标注了不确定性，不做 100% 确定性声明。

---

## 注意事项

1. Claude Code 是闭源商业软件，逆向分析仅供学习参考
2. 分析基于特定版本（v1.0.33），后续版本可能有重大变化
3. Source Map 还原的代码丢失了注释和原始变量名
4. 不应将逆向代码用于商业目的
