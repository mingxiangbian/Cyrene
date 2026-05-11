# Context & Memory Management — 上下文与记忆管理

## 来源
- HuggingFace: Context Engineering & Reuse Pattern Under the Hood of Claude Code
- GitHub: VILA-Lab/Dive-into-Claude-Code
- GitHub: HZ0108/Inside-Claude-Code-Architecture-and-Design-Philosophy
- GitHub: 777genius/claude-code-source-code-full

---

## 三级记忆系统

Claude Code 不使用向量数据库——纯粹基于文件系统的 Markdown + YAML Frontmatter。

| 层级 | 机制 | 容量 | 生命周期 | 特点 |
|------|------|------|---------|------|
| **短期记忆** | 当前会话消息流 | ~200K tokens | 单次会话 | 实时交互 |
| **中期记忆** | Token 92% 阈值触发压缩 | 压缩后语义表示 | 跨轮次 | 高密度摘要 |
| **长期记忆** | CLAUDE.md + Memory 文件 | 无上限 | 持久化 | 用户偏好、配置 |

---

## 上下文来源（9 个有序源）

Claude Code 按以下顺序组装上下文：

```
1. 系统提示基础 (System Prompt Base)
2. 项目级 CLAUDE.md
3. 父目录 CLAUDE.md（向上递归到 ~/.claude/CLAUDE.md）
4. 用户级 CLAUDE.md (~/.claude/CLAUDE.md)
5. Memory 文件（MEMORY.md 索引 + 具体 memory/*.md）
6. 激活的 Skills（通过 Skill 工具加载的 Markdown）
7. Slash Commands（用户显式调用）
8. 对话历史（压缩后）
9. 工具执行结果
```

### CLAUDE.md 4 级层次

```
~/.claude/CLAUDE.md          ← 用户全局指令（所有项目）
  ↑ 递归向上
../CLAUDE.md                 ← 父目录指令
  ↑
./CLAUDE.md                  ← 项目级指令
  ↑
./.claude/CLAUDE.md          ← 项目本地指令
```

---

## 五阶段上下文压缩管道

### 1. Budget Reduction
检查当前 token 预算，预估是否需要压缩。

### 2. Snip（裁剪）
移除最旧的非关键消息，保留最近的对话上下文。

### 3. Microcompact
只清理旧的工具调用结果，保留对话主线。不触发模型调用。

### 4. Context Collapse
折叠冗余信息，合并多次相似的工具调用结果。

### 5. Auto-Compact（87% 阈值）
Token 消耗接近上下文窗口 87% 时自动触发：
- 让 AI 对整段对话生成摘要
- 用摘要替换原始历史
- **严格禁止在压缩时调用工具**（防止压缩本身消耗更多 token）

---

## Memory 系统设计

### 文件结构
```
.claude/projects/-<project-path>/
  MEMORY.md          ← 索引文件（每行一条记忆指针）
  memory/
    user_role.md     ← 用户角色、偏好
    feedback_*.md    ← 用户反馈、行为准则
    project_*.md     ← 项目信息、上下文
    reference_*.md   ← 外部资源引用
```

### Memory 类型

| 类型 | 用途 | 示例 |
|------|------|------|
| user | 用户角色、偏好、知识背景 | "我是一名数据科学家" |
| feedback | 用户的行为反馈和准则 | "不要 mock 数据库" |
| project | 项目决策、目标、约束 | "合并冻结至 3 月 5 日" |
| reference | 外部系统信息 | "Bug 追踪在 Linear INGEST" |

### Memory 文件格式
```markdown
---
name: <记忆名称>
description: <一行描述>
type: <user|feedback|project|reference>
---

<内容 — 反馈/项目类型遵循：规则/事实 → Why → How to apply>
```

---

## 前缀缓存优化

Claude Code 的系统提示和工具定义被精心设计以最大化 Anthropic API 的 Prompt Caching：

### 分段策略
- 静态前缀（可缓存）：系统提示基础、工具列表、CLAUDE.md
- 动态后缀（不可缓存）：对话历史、工具调用结果

### 工具排序优化
- 内置工具提示排在前面 → 可缓存前缀
- MCP 工具提示追加在后面 → 独立后缀

### Warm-up 调用
在 Agent 实际工作前，发送预热请求填充 KV Cache：
- 工具列表预加载
- Explore/Plan Agent 系统提示预加载
- 这些调用的缓存命中率贡献后续所有调用的效率

### 实际效果
- 子 Agent ReAct 循环复用率 **92-98%**
- 成本降低约 **81%**（缓存命中时成本为 10%）
- 预热调用的开销被后续节省完全覆盖

---

## Context Collapse vs Auto-Compact

| 维度 | Context Collapse | Auto-Compact |
|------|-----------------|--------------|
| 触发 | 固定规则 | Token 达到 87% 阈值 |
| 方式 | 程序化折叠 | LLM 生成摘要 |
| 工具调用 | 不涉及 | 严禁调用工具 |
| 信息损失 | 低（结构性折叠） | 中（语义压缩） |
| 成本 | 零 | 一次 LLM 调用 |
