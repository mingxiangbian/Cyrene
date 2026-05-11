# Agent Teams — 并行智能体协作

## 来源
- TowardsAWS: The Switch Got Flipped: A Technical Deep Dive into Anthropic's "Agent Teams"
- SitePoint: Claude Code Agent Teams: Run Parallel AI Agents on Your Codebase
- Nicholas Carlini 的 C 编译器实验
- Reddit / Hacker News 社区讨论

---

## 从 Subagent 到 Agent Teams 的范式转变

### Subagent（旧范式）
```
        Main Agent
       /    |    \
   Sub1   Sub2   Sub3
```
- Hub-and-Spoke 通信（只通过主 Agent）
- 主 Agent 管理一切
- 单向任务委派

### Agent Teams（新范式，2026.02）
```
    Agent1 ←→ Agent2
      ↕         ↕
    Agent3 ←→ Agent4
```
- P2P 网状通信
- 共享任务列表
- 自协调（无中心调度者）

---

## TeammateTool 13 个核心操作

### 团队管理
| 操作 | 功能 |
|------|------|
| spawnTeam | 创建新团队 |
| discoverTeams | 发现已有团队 |
| requestJoin | 申请加入团队 |

### 任务
| 操作 | 功能 |
|------|------|
| assignTask | 分配任务 |
| claimTask | 认领任务 |
| completeTask | 完成任务 |

### 通信
| 操作 | 功能 |
|------|------|
| broadcastMessage | 广播消息 |
| sendMessage | 发送私信 |
| readInbox | 读取收件箱 |

### 决策
| 操作 | 功能 |
|------|------|
| voteOnDecision | 投票决策 |
| proposeChange | 提议变更 |

### 生命周期
| 操作 | 功能 |
|------|------|
| shutdown | 关闭团队 |
| cleanup | 清理资源 |

---

## 文件系统协调

Agent Teams 使用文件系统作为共享状态：

```
~/.claude/teams/{team-name}/
  config.json        ← 团队配置
  messages/          ← 消息队列
  tasks/             ← 共享任务列表
  decisions/         ← 投票记录
```

### 任务协调机制
```
current_tasks/
  task-001.json  ← { status: "pending", claimed_by: null, ... }
  task-002.json  ← { status: "in_progress", claimed_by: "agent-3", ... }
  task-003.json  ← { status: "completed", claimed_by: "agent-1", ... }
```

使用文件锁（lock files）防止竞态条件。

---

## Nicholas Carlini 的 $20,000 C 编译器实验

2026 年 2 月最具影响力的 Agent Teams 实践：

### 配置
- **16 个** Claude Opus 4.6 Agent
- 运行在独立 Docker 容器中
- 持续 **2 周**
- 约 **2,000 次** Claude Code 会话
- 约 **$20,000** API 费用

### 成果
- **100,000 行** Rust 代码
- 用 Rust 编写的完整 C 编译器
- 通过 **99%** GCC torture 测试

### 关键技术
- Bare Git 仓库 + `current_tasks/` 目录
- Lock 文件实现任务互斥
- 独立 Docker 容器实现环境隔离
- 文件系统作为 Agent 间通信总线

---

## Agent Teams vs Subagents 对比

| 维度 | Subagents | Agent Teams |
|------|-----------|-------------|
| 通信 | Hub-and-Spoke | P2P 网状 |
| 协调 | 主 Agent 管理一切 | 共享任务列表 + 自协调 |
| 上下文 | 独立窗口 | 独立窗口 |
| Token 成本 | 较低（只返回摘要） | 较高（每个 teammate = 完整实例） |
| 可控性 | 高（中心化控制） | 中（自组织） |
| 扩展性 | 受限于主 Agent 上下文 | 线性扩展 |
| 适用场景 | 研究、探索、审计 | 协作构建、对抗审查 |

---

## 社区验证模式

### Karen The Validator（对抗审查）
- 1 个 Executor Agent + 1 个 KarenTheValidator Agent
- Karen 使用 OWASP Top 10 检查清单审查 Executor 的输出
- 某金融团队报告：代码审查通过率从 43% 提升到 89%

### Spec×Build Twin（规范驱动）
- 1 个 PM Agent 维护 Spec 文档
- 1 个 Builder Agent 执行实现
- 需求变更响应时间提升 75%

### OODA Loop（军事决策模型）
- Observe Agent → Orient Agent → Decide Agent → Act Agent
- Orchestrator Agent 一键调用全部四个
- 适合复杂、不确定性的任务

---

## Agent Teams 的最佳实践

1. **从简单开始** — 先用 2-3 个 Agent 验证协作模式
2. **明确角色边界** — 每个 Agent 的职责描述要非常具体
3. **使用对抗审查** — 总是配对一个 Validator
4. **文件系统作为通信总线** — 简单、可靠、可调试
5. **保持独立性** — 每个 Agent 在隔离环境中运行
6. **任务粒度适中** — 太小则通信开销大，太大则失去并行优势
