# agentmemory (rohitg00/agentmemory) 记忆系统

## 来源
- GitHub: [rohitg00/agentmemory](https://github.com/rohitg00/agentmemory)
- DeepWiki
- Web 搜索相关技术文章

---

## 概述

agentmemory 是一个独立的持久化记忆服务器，专为 AI 编程 agent 设计。TypeScript/Node.js 实现，底层使用 Rust `iii-engine` 运行时。Apache-2.0 协议，9,300+ stars。

核心卖点：**Agent 无关** — 通过 MCP 协议（~51 个工具）或 REST API（端口 3111）供 Claude Code、Cursor、Codex CLI、Gemini CLI 等任何 agent 使用。

---

## 文件结构

```
iii-engine 运行时 (Rust)
  └── SQLite 本地存储
       ├── BM25 全文索引
       ├── 向量嵌入 (all-MiniLM-L6-v2 本地模型)
       └── 知识图谱 (实体链接)

API 端口: 3111 (REST), 3113 (实时查看器)
```

无外部数据库依赖，纯本地 SQLite。

---

## 三流检索 (Triple-Stream Retrieval)

三种检索器并行运行，通过 **Reciprocal Rank Fusion (RRF, k=60)** 融合：

| 检索器 | 用途 | 特点 |
|--------|------|------|
| **BM25 (关键词)** | 函数名、文件路径、标识符 | 始终激活，零成本 |
| **向量嵌入 (语义)** | 语义相似搜索 | 默认 `all-MiniLM-L6-v2` 本地模型；支持 OpenAI/Gemini/Voyage/Claude |
| **知识图谱遍历** | 实体链接记忆 | 通过实体匹配发现关联记忆 |

**融合性能 (LongMemEval-S, ICLR 2025):**
- R@5 = 95.2%, R@10 = 98.6%, MRR = 88.2%

---

## 四层记忆合并管道

灵感来自人类记忆模型：

```
原始捕获 → Working (工作记忆: 即时观察)
         → Episodic (情节记忆: 会话级摘要，"发生了什么")
         → Semantic (语义记忆: 结构化事实/概念，"我知道什么")
         → Procedural (程序记忆: 可复用工作流，"怎么做")
```

---

## 12 个自动捕获 Hook

为 Claude Code 集成注册了 12 个生命周期 Hook，**全自动静默捕获**：

| Hook | 触发时机 | 捕获内容 |
|------|---------|---------|
| SessionStart | 会话开始 | 项目路径、会话 ID |
| UserPromptSubmit | 用户发消息 | 用户提示（隐私过滤后） |
| PreToolUse | 工具执行前 | 文件访问模式 + 上下文 |
| **PostToolUse** | **每次工具调用后** | **工具名、输入、输出（核心捕获点）** |
| PostToolUseFailure | 工具错误 | 错误上下文 |
| PreCompact | 上下文压缩前 | 压缩前重新注入记忆 |
| SubagentStart/Stop | 子 agent 生命周期 | 子 agent 事件 |
| Stop/SessionEnd | 会话结束 | 会话摘要 + 完成标记 |

---

## PostToolUse 处理管道

```
PostToolUse 触发
  → SHA-256 去重 (5 分钟窗口)
  → 隐私过滤器 (清除 secrets/API keys)
  → 存储原始观察记录
  → LLM 压缩为结构化事实 + 概念 + 叙述
  → 向量嵌入
  → BM25 + 向量索引
```

---

## 写入决策

**完全自主，无需任何人工干预：**
- Hook 自动捕获一切
- LLM 压缩步骤将原始观察蒸馏为结构化记忆
- 置信度评分 + Ebbinghaus 衰减曲线自动淘汰噪声
- 用户不需要说"记住" — 记忆是基础设施，不是互动行为

---

## 更新机制

| 机制 | 说明 |
|------|------|
| **自动版本控制** | Jaccard 相似度超集检测，新事实覆盖旧事实 |
| **矛盾检测与解决** | 冲突记忆自动对比、裁决 |
| **级联过时传播** | 上游记忆被覆盖时，下游自动更新 |
| **TTL 过期** | 时效性记忆自动过期 |
| **置信度评分** | 每条记忆有置信度分数 |
| **来源追踪** | JIT 验证：追踪记忆回到原始观察 |

---

## 容量管理

| 机制 | 说明 |
|------|------|
| **Ebbinghaus 遗忘曲线** | 频繁访问的记忆增强；不访问的自动淘汰 |
| **重要性淘汰** | 低价值记忆被清退 |
| **Token 预算** | 每会话 ~2,000 tokens 注入上下文（vs. 全上下文 19.5M tokens/年） |
| **成本** | ~$10/年 (vs. LLM 摘要方案 ~$500/年) |
| **自愈** | 熔断器、provider 回退链、健康监控 |

---

## 核心优势

1. **Agent 无关** — 一个记忆服务器服务多个 agent，跨会话共享
2. **零外部依赖** — 只有 SQLite + iii-engine，可完全离线
3. **开箱即用** — 12 个 hook 全自动捕获，零配置
4. **成本极低** — $10/年 vs 其他方案的 $500/年

## 核心劣势

1. **重基础设施** — 需要运行独立的 Rust 运行时服务
2. **过度捕获风险** — 自动捕获一切可能产生噪声
3. **不适合轻量场景** — 对于单用户本地 agent 过于庞大
