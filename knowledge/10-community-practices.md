# Community Practices — 社区实践与模式

## 来源
- Twitter/X 技术社区
- Reddit r/ClaudeAI
- PubNub Engineering Blog
- GitHub: Aedelon/claude-code-blueprint
- GitHub: pdoronila/cc-sdd
- GitHub: asiflow/claude-nexus-hyper-agent-team

---

## 开源参考实现

### 完整重实现
| 项目 | 语言 | 规模 | 焦点 |
|------|------|------|------|
| open-multi-agent | TypeScript (~8K LOC) | 中型 | 多 Agent 编排层，模型无关 |
| claw-code | Python → Rust | 大型 | Clean-room 重写整个 Claude Code |
| claude-code-blueprint | 配置 | 大型 | 生产级 6 层架构配置 |
| claude-nexus-hyper-agent-team | 配置+测试 | 大型 | 31 Agent 团队 + 341 合约测试 |

### 逆向分析
| 仓库 | 内容 |
|------|------|
| LDCRsddh/analysis_claude_code | v1.0.33 完整逆向 + 重构蓝图 |
| ThreeFish-AI/analysis_claude_code | 中文逆向分析 |
| DBinK/analysis_claude_code | 架构文档 |
| AgiFlow/claude-code-prompt-analysis | 网络流量分析 + 5 注入点 |

### 记忆/上下文系统
| 项目 | 功能 |
|------|------|
| AutoDream | 逆向实现 KAIROS 3 层记忆 |
| Context-Engine | 4 层记忆，跨 60+ 会话持久化 |

---

## 社区验证的生产模式

### 1. PubNub 3-Agent 生产流水线

```
pm-spec → architect-review → implementer-tester
  ↓            ↓                    ↓
 写Spec    验证+写ADR          编码+测试+文档
  ↓            ↓                    ↓
READY_FOR_ARCH  READY_FOR_BUILD    DONE
```

**关键创新**：使用 `SubagentStop` Hook 读取队列文件强制执行阶段检查。

### 2. Spec-Driven Development (cc-sdd)

```
PM Agent (维护 Spec 文档)
  ↕ (Spec 文件作为共享状态)
Builder Agent (执行实现)
```

- 需求变更响应时间提升 75%
- Spec 文件是 Agent 之间的"合约"

### 3. Karen The Validator (对抗审查)

```
Executor Agent → KarenTheValidator Agent
                      ↓
              OWASP Top 10 清单
                      ↓
              通过 / 驳回 + 修改建议
```

- 某金融团队：代码审查通过率从 43% → 89%

### 4. OODA Loop 模式

```
. claude/agents/
  observe.md     → 信息收集
  orient.md      → 目标对齐
  decide.md      → 方案选择
  act.md         → 执行
  orchestrator.md → 一键调用全部四个
```

从军事决策模型 OODA（Observe-Orient-Decide-Act）改编。

### 5. Aedelon 6 层蓝图

```
Layer 1: CLAUDE.md      (内核 — 行为准则)
Layer 2: Memory          (持久化记忆 + 规则)
Layer 3: Skills          (32 个 Skills, AAPEV 5 阶段模式)
Layer 4: Agents           (按领域特化的子 Agent)
Layer 5: Security         (40 allow + 38 deny 规则, 17 hook 事件)
Layer 6: MCP              (6 个 MCP Server)
```

### 6. Nexus 31-Agent 团队

```
8 层团队结构:
  Builders       ← 构建者
  Guardians      ← 守卫者（安全审查）
  Strategists    ← 策略师
  Intelligence   ← 情报收集
  Meta           ← 元认知
  Governance     ← 治理
  CTO            ← 技术决策
  Verification   ← 验证
```

特性：
- NEXUS syscall 协议（SPAWN, SCALE, RELOAD, MCP...）
- 每个 Agent 的贝叶斯信任校准
- 动态招聘新 Agent 流程
- 可选"Shadow Mind"并行认知层
- 341 个合约测试

---

## 从零开始构建 Agent 的学习路径

基于社区共识的推荐路径：

### 阶段 1：理解核心概念（1-2 周）
1. 阅读 Claude Code 架构文档
2. 理解 Agent Loop（AsyncGenerator while 循环）
3. 理解工具系统（Tool<T> 接口 + 执行生命周期）
4. 理解权限模型（Deny-First 规则引擎）

### 阶段 2：搭建最小原型（2-4 周）
1. 实现一个简单的 Agent Loop（50 行代码）
2. 添加 3-5 个基础工具（Read, Write, Bash, Grep）
3. 添加简单的权限检查
4. 接入 LLM API

### 阶段 3：添加进阶特性（4-8 周）
1. 上下文压缩（Auto-Compact）
2. 子 Agent 委托
3. MCP 协议支持
4. 文件系统记忆系统

### 阶段 4：生产化（持续）
1. Hooks 系统
2. 前缀缓存优化
3. Agent Teams 协作
4. 监控和日志

---

## 关键 GitHub 仓库汇总

| 仓库 | 用途 |
|------|------|
| [VILA-Lab/Dive-into-Claude-Code](https://github.com/VILA-Lab/Dive-into-Claude-Code) | 最全面的架构分析 |
| [777genius/claude-code-source-code-full](https://github.com/777genius/claude-code-source-code-full) | 源码级架构文档 |
| [Windy3f3f3f3f/how-claude-code-works](https://github.com/Windy3f3f3f3f/how-claude-code-works) | 工具系统深度分析 |
| [HZ0108/Inside-Claude-Code-Architecture-and-Design-Philosophy](https://github.com/HZ0108/Inside-Claude-Code-Architecture-and-Design-Philosophy) | 10 篇 PDF 深度报告 |
| [LDCRsddh/analysis_claude_code](https://github.com/LDCRsddh/analysis_claude_code) | 最完整的逆向工程 |
| [AgiFlow/claude-code-prompt-analysis](https://github.com/AgiFlow/claude-code-prompt-analysis) | 网络流量分析 |
| [Aedelon/claude-code-blueprint](https://github.com/Aedelon/claude-code-blueprint) | 生产级配置蓝图 |
| [asiflow/claude-nexus-hyper-agent-team](https://github.com/asiflow/claude-nexus-hyper-agent-team) | 31-Agent 协作系统 |

## 关键文章

| 文章 | 来源 |
|------|------|
| Claude Code Internals: Reverse Engineering Prompt Augmentation Mechanisms | [AgiFlow Blog](https://agiflow.io/blog/claude-code-internals-reverse-engineering-prompt-augmentation/) |
| Context Engineering & Reuse Pattern Under the Hood | [HuggingFace Blog](https://huggingface.co/blog/kobe0938/context-engineering-reuse-pattern-claude-code) |
| How Claude Code Is Raising the Ceiling of Intelligence | [Snyk](https://snyk.io/articles/claude-code-raising-intelligence-ceiling/) |
| Best practices for Claude Code subagents | [PubNub](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/) |
| The Switch Got Flipped: Agent Teams Deep Dive | [TowardsAWS](https://towardsaws.com/the-switch-got-flipped-a-technical-deep-dive-into-anthropics-agent-teams-9e1093446f09) |
| Claude Code Extensions Explained | [TowardsAI](https://pub.towardsai.net/claude-code-extensions-explained-skills-mcp-hooks-subagents-agent-teams-plugins-9294907e84ff) |
| Claude Code 遭深度逆向工程 | [51CTO](https://51cto.com/aigc/6811.html) |
| Anthropic: How we built our multi-agent research system | [Simon Willison](https://simonwillison.net/2025/Jun/14/multi-agent-research-system/) |

---

## 社区活跃讨论平台

- **Reddit**: r/ClaudeAI — 最活跃的 Claude Code 社区
- **Twitter/X**: 关注 @AnthropicAI, @carlini（Nicholas Carlini）
- **GitHub**: 上述逆向工程仓库的 Issues/Discussions
- **知乎**: Claude Code 话题下的技术讨论
- **即刻**: Claude Code 逆向和架构分析相关动态
