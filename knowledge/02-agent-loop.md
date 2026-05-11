# Agent Loop — 核心调度引擎

## 来源
- GitHub: VILA-Lab/Dive-into-Claude-Code (architecture.md)
- GitHub: 777genius/claude-code-source-code-full
- GitHub: LDCRsddh/analysis_claude_code (逆向工程 v1.0.33)
- HuggingFace: Context Engineering & Reuse Pattern Under the Hood of Claude Code

---

## 核心 Agent Loop 设计

Claude Code 的核心是一个 **AsyncGenerator 驱动的 while 循环**（`queryLoop`），不是传统的固定步骤流水线：

```
while (未完成) {
  1. 调用 LLM API（流式）
  2. 解析响应（文本 + 工具调用）
  3. 执行工具（并发 or 串行）
  4. 收集结果，注入上下文
  5. 检查终止条件
  6. 判断是否需要压缩上下文
}
```

### 关键洞察

> Agent Loop 中 ~1.6% 是 AI 决策逻辑，98.4% 是基础设施代码。

---

## 9 步 Turn Pipeline

每个对话轮次经过 9 个阶段：

```
1. 接收用户输入
2. 上下文预算检查（Budget Reduction）
3. 历史消息裁剪（Snip）
4. 微压缩（Microcompact）— 清理旧工具结果
5. 上下文折叠（Context Collapse）
6. 自动压缩（Auto-Compact，87% 阈值触发）
7. 系统提示组装（fetchSystemPromptParts）
8. LLM API 调用（流式）
9. 响应后处理（工具调用分发 or 文本输出）
```

### 5 阶段上下文塑造（Pre-model）

1. **Budget Reduction** — 检查 token 预算
2. **Snip** — 裁剪旧消息
3. **Microcompact** — 清理旧工具调用结果，保留对话主线
4. **Context Collapse** — 折叠冗余信息
5. **Auto-Compact** — Token 达到 87% 阈值时自动触发，让 AI 生成摘要替换历史

---

## 主循环引擎组件（逆向工程发现）

来自 v1.0.33 二进制逆向工程：

### nO — Main Loop Engine (AgentLoop)
- AsyncGenerator 实现
- 支持中断/恢复控制
- 状态机驱动

### h2A — Message Queue
- 双缓冲异步消息队列
- 零延迟路径 + 背压控制
- 处理能力 > 10,000 消息/秒

### wU2 — Compressor
- 92% token 阈值自动触发
- 保留关键信息，压缩次要细节
- 严格禁止在压缩时调用工具

### MH1 — Tool Engine
- 6 阶段执行管道：发现 → 验证 → 权限检查 → 资源分配 → 并发执行 → 清理
- 工具按 isConcurrencySafe 分类调度

### UH1 — Concurrency Scheduler
- 最大 10 个工具并发
- 智能负载均衡
- 优先级队列

---

## 消息流

```
User Input
  → processUserInput()           (预处理)
    → QueryEngine.submitMessage() (提交到引擎)
      → fetchSystemPromptParts()  (组装系统提示)
        → queryLoop()             (主循环)
          → LLM API call          (模型推理)
            → tool dispatch       (工具分发)
              → result collection (结果收集)
                → response render (渲染输出)
```

---

## 错误处理与重试

- 自动重试 + 指数退避
- Token 计数实时监控
- 上下文溢出自动触发压缩
- 工具调用失败时智能重试（不重复被拒绝的调用）

---

## 前缀缓存优化

Claude Code 在 API 层面深度利用了 Anthropic 的 Prompt Caching：

- 子 Agent ReAct 循环中复用率达 **92-98%**
- 预热调用（Warm-up）专门用于填充 KV Cache
- 系统提示被分段设计以最大化缓存命中
- 实际成本降低约 **81%**（相比无缓存）
- 内置工具的提示排在前面（可缓存前缀），MCP 工具追加在后面
