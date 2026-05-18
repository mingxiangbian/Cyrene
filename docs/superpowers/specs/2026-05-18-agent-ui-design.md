# cc-local Agent UI 设计规格

## 目标

为 cc-local 本地 Agent 加入实时工具调用展示，解决推理期间用户看不到进度、不知道 Agent 在做什么的核心体验问题。

## 约束

- 本地模型（Qwen 9B）不支撑多 Agent 并行
- 不做真流式（SSE parsing），用 Observer 回调 + 伪流式
- 不改 llm-client 接口契约
- 纯 chalk + 字符串渲染，不引入 Ink/Blessed/Boxen
- 不缓存全屏状态，行式增量输出，保留终端 scrollback

## 架构

```
agent-loop.ts              repl.ts / main.ts
    │                           │
    ├─ onThinkingStart()  ────►│  单行 spinner + 实时计时
    ├─ onThinkingStop(ms) ────►│  清除 spinner 行
    ├─ onToolCallStart()  ────►│  新行打印图标 + 工具名 + 参数摘要
    ├─ onToolCallResult() ────►│  同行追加状态标记
    ├─ onResponse(text)   ────►│  分隔线 + 最终回答
    └─ return             ────►│
```

在 agent-loop 输入中增加可选的 `observer?: AgentObserver`。agent-loop 本身不感知渲染细节。

## AgentObserver 接口

```typescript
interface AgentObserver {
  onThinkingStart(): void
  onThinkingStop(durationMs: number): void
  onToolCallStart(name: string, summary: string): void
  onToolCallResult(name: string, ok: boolean, durationMs: number, summary: string): void
  onResponse(text: string): void
}
```

## 终端渲染行为

### 思考状态

- 单行动态 spinner，使用 Braille 字符轮转：`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`
- 实时计时递增：`⏳ Thinking · 4.2s`
- 用 `\r` + `readline.clearLine` 原地覆写
- API 返回后清除该行，转为工具调用或分隔线

### 工具调用

- 新行打印：图标（单字符） + 工具名 + 参数摘要
- 图标语义系统：

| 操作语义 | 图标 | 触发工具 |
|---------|------|---------|
| 读 | 📖 | file_read, grep, glob |
| 写 | ✏️ | file_edit, file_write |
| 执行 | ⚡ | bash |
| 搜索 | 🌐 | web_search |
| 交互 | 💬 | ask_user |

- 完成后同行追加状态：
  - 成功：`✓ 0.3s`
  - 失败：`✗ 错误摘要`
- 工具输出过长时截断显示，追加 `...(truncated)`

### 最终回答

- 先打印分隔线 `────` 作为视觉断点
- 再打印模型回答文本
- 一次性模式额外打印 `tool calls: N`

## 图标语义系统

| 操作 | 图标 | 触发条件 |
|------|------|---------|
| 读 | 📖 | file_read, grep, glob |
| 写 | ✏️ | file_edit, file_write |
| 执行 | ⚡ | bash |
| 搜索 | 🌐 | web_search |
| 交互 | 💬 | ask_user |
| 思考 | ⏳ | LLM 推理中 |

## 状态流转

```
            ┌──────────┐
            │  ⏳ 思考  │ ← 计时器递增，spinner 旋转
            └─────┬────┘
                  │
        ┌─────────┼──────────┐
        ▼         ▼           ▼
   模型返回     模型返回     模型返回
   纯文本      工具调用     空响应
        │         │           │
        ▼         ▼           ▼
   ┌────────┐ ┌────────┐  ⏳ 重新思考
   │ 展示最终│ │📖 file │  (最多一次)
   │ 回答   │ │   ...   │
   └────────┘ └───┬────┘
                  │
          ┌───────┼───────┐
          ▼               ▼
      执行成功          执行失败
          │               │
          ▼               ▼
   📖 file ✓ 0.3s   📖 file ✗ (显示错误摘要)
          │               │
          └───────┬───────┘
                  │
                  ▼
            ⏳ 下一轮思考
```

## 边界情况

| 场景 | 表现 |
|------|------|
| 首次进入 REPL | 显示欢迎行：`cc-local · Qwen3.5-9B · /help` |
| 空输入 | 不调模型，直接回到 `>` |
| `/help` | 展示可用命令列表 |
| `/model` | 展示当前模型和 API 地址 |
| Ctrl+C | 停止当前推理，清掉本轮工具链，回到 `>` |
| 推理超时 | `⏳ 思考 · 30.0s ⚠️ 超时，重试中...` |
| 工具输出极长 | 截断显示，追加 `...(truncated)` |
| 管道/重定向（一次性模式）| 工具链状态走 stderr，最终回答走 stdout |

## 文件变更

| 操作 | 文件 | 内容 |
|------|------|------|
| 新增 | `src/ui-observer.ts` | `AgentObserver` 接口 + `createTerminalObserver()` 工厂 |
| 编辑 | `src/agent-loop.ts` | 输入加 `observer?`，在关键节点回调 |
| 编辑 | `src/repl.ts` | 创建 observer，加 `/help` `/model` 命令 |
| 编辑 | `src/main.ts` | 一次性模式传入 observer |
| 不碰 | `llm-client.ts`, `context.ts`, `config.ts`, `memory.ts`, `tools/` | — |

## 依赖

无新增 npm 依赖。所有渲染用 chalk（已有）+ Node.js readline 内置 API。
