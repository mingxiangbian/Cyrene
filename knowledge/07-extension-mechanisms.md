# Extension Mechanisms — 扩展机制

## 来源
- TowardsAI: Claude Code Extensions Explained
- AgiFlow: Claude Code Internals: Reverse Engineering Prompt Augmentation Mechanisms
- Anthropic 官方博客
- Reddit r/ClaudeAI 社区讨论

---

## 六大扩展机制总览

| 扩展 | 发布时间 | 机制 | 核心区别 |
|------|---------|------|---------|
| **MCP** | 2024.11 | 结构化 JSON I/O，访问控制 | 外部工具集成 |
| **Subagents** | 2025.07 | 隔离对话，Hub-and-Spoke | 委派专注任务 |
| **Hooks** | 2025.09 | 生命周期事件触发 Shell 脚本 | 不依赖 Prompt 的规则执行 |
| **Plugins** | 2025.10 | MCP + Commands + Agents 打包 | 分发 |
| **Skills** | 2025.10 | 模型调用的 Markdown 工作流 | 自动激活能力 |
| **Agent Teams** | 2026.02 | P2P 网状协作，共享任务列表 | 协作式多 Agent |

---

## MCP (Model Context Protocol)

### 架构
```
Claude Code → MCP Client → MCP Server (外部进程)
                              ↓
                         外部工具/数据源
```

### 特点
- 结构化 JSON 通信
- 访问控制
- 工具发现协议
- 支持自定义 Server

### 与内置工具的关系
- 内置工具排在 Prompt 前缀（可缓存）
- MCP 工具追加在 Prompt 后缀（不可缓存）
- 这是刻意的设计：最大化内置工具的缓存命中率

---

## Skills

### 工作机制
Skills 是**模型调用的 Markdown 工作流**——不是用户手动触发的命令：

1. 系统在 `<system-reminder>` 中列出可用 Skills
2. 模型根据任务上下文决定是否调用 Skill
3. 调用 `Skill` 工具，传入 Skill 名称
4. Skill 的 Markdown 内容被加载到上下文
5. 模型按照 Skill 中的指令执行

### Skill 的注入点
Skills 通过 `tool_result` 注入用户消息中，在单个轮次内生效。

### 与 Slash Commands 的区别
| 维度 | Slash Commands | Skills |
|------|---------------|--------|
| 触发方式 | 用户显式输入 | 模型自动决定 |
| 注入方式 | `<command-message>` | `tool_result` |
| 作用范围 | 单轮次 | 单轮次 |
| 可见性 | 用户可见 | 用户可见 |

---

## Hooks

### 机制
Hooks 是在生命周期事件时触发的**确定性 Shell 脚本**：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "~/.claude/hooks/check-bash.sh"
      }
    ]
  }
}
```

### 关键特性
- `exit 0` — 允许继续
- `exit 2` — 阻止操作（不可绕过）
- `exit 其他` — 警告但继续
- stdin 接收 JSON 格式的上下文信息
- stdout 可注入额外上下文

### 常用 Hook 事件
| 事件 | 触发时机 |
|------|---------|
| PreToolUse | 工具执行前 |
| PostToolUse | 工具执行后 |
| SubagentStop | 子 Agent 完成时 |
| PreCompact | 上下文压缩前 |
| SessionStart | 会话开始时 |
| SessionEnd | 会话结束时 |

### 社区最佳实践
- PubNub 用 `SubagentStop` Hook 实现流水线强制阶段检查
- Hook 读取队列文件，打印下一个建议命令
- 保持人在回路中（Human-in-the-loop）

---

## Plugins

### 组成
Plugin = MCP Server + Commands + Agents 的打包单元

### 分发
- 通过 npm / GitHub 分发
- `opencli plugin install <name>` 安装

---

## 五种 Prompt 注入机制（逆向工程发现）

AgiFlow 通过网络流量分析发现 5 个不同的注入点：

| 机制 | 注入点 | 激活方式 | 作用范围 |
|------|--------|---------|---------|
| CLAUDE.md | `<system-reminder>` | 自动 | 项目级别 |
| Output Styles | System Prompt | `/output-style` | 会话级别 |
| Slash Commands | `<command-message>` | 用户显式 | 单轮次 |
| Skills | `tool_result` | 模型决定 | 单轮次 |
| Sub-Agents | 独立对话 | Task 工具 | 隔离 |

---

## 扩展机制的"上下文成本"阶梯

从低到高：

```
Skills（文本注入，几乎零成本）
  → Hooks（Shell 脚本执行，低延迟）
    → MCP（进程间 JSON 通信）
      → Subagents（独立 API 调用，prefix cache 可复用）
        → Agent Teams（多实例并行，最高成本）
```

选择扩展机制时，应从成本最低的方案开始，逐级升级。
