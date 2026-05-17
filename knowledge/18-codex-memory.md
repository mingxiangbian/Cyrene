# OpenAI Codex 记忆系统

## 来源
- Web 搜索 Codex memory pipeline 技术分析
- DeepWiki: Codex internal architecture
- GitHub Issues 和社区讨论

---

## 三层架构

| 层 | 生命周期 | 内容 |
|------|---------|------|
| Agent Loop (实时上下文) | 单轮/会话 | 当前对话、工具调用、输出 |
| Context Compaction (上下文压缩) | 会话内 | 窗口快满时的压缩摘要 |
| Long-Term Memory Pipeline (长期记忆) | 跨会话 | 提取的知识、用户偏好、可复用工作流 |

---

## 文件结构

```
CODEX_HOME/memories/
  memory_summary.md              ← 始终加载到 system prompt (导航索引)
  MEMORY.md                      ← 手册条目，可 grep 知识库
  raw_memories.md                ← 临时：合并 Phase 1 输出
  skills/<skill-name>/
    SKILL.md                     ← 可复用程序 (入口)
  rollout_summaries/<slug>.md    ← 每次 rollout 摘要 + 证据
```

存储后端:
- SQLite 状态数据库 (threads, stage1_outputs, jobs, thread_spawn_edges 表)
- Rollout 文件: JSONL 事件日志 (SessionMeta, ResponseItem, TurnContext, EventMsg, Compacted)
- 记忆文件: git 管理的 Markdown 文件夹

---

## 上下文压缩 (Context Compaction)

触发阈值：~90% 上下文窗口。使用专用 `/responses/compact` 端点。

流程：
1. 克隆当前对话历史
2. 附加压缩请求: "Create a handoff summary for another LLM that will resume the task"
3. 模型返回压缩替换内容，包含：
   - `encrypted_content` — 不透明字段，**保存模型的"潜在理解"**（关键创新）
   - 结构化摘要 — 进度、决策、下一步
4. 实时历史替换为最近消息 + 压缩摘要
5. Rollout 文件保留完整原始对话（供未来提取）

**压缩是有损的** — 摘要未捕获的细节对后续对话不可见。但 `encrypted_content` 保留了模型内部表示，减少信息损失。

---

## 长期记忆管道 (两阶段)

### Phase 1: 启动提取 (Per-Rollout)

后台任务，每次用户轮次后运行。

选择标准：
- 仅非临时、非子 agent 会话
- 空闲 ≥ 6 小时
- 最近 10 天内
- 每次启动最多 2 个 rollout

流程：
1. 扫描 `stage1_outputs` 表中的过时线程
2. 读取 rollout .jsonl 文件（完整事件日志）
3. 过滤掉系统消息、AGENTS.md 注入、skill 标记
4. 使用轻量模型 (`gpt-5.4-mini`, 低 reasoning)
5. Prompt: **"Will a future agent plausibly act better because of what I write here?"**
6. 只有真正有用时才输出（**no-op 闸门**）
7. 输出: `Stage1Output` 结构 (raw_memory + rollout_summary + slug)

### Phase 2: 全局合并 (Multi-Rollout Merge)

定期后台任务，全局锁保护（默认 6 小时冷却，同一 CODEX_HOME 一次一个）。

流程：
1. 收集最近未合并的 stage1_outputs
2. 同步输入到记忆工作区
3. 运行合并 agent (`gpt-5.4`, 中等 reasoning, 无网络):
   - 读取上次基准的 git-style diff
   - 执行**增量更新**（非全量重写）
   - 写入结构化文件

---

## 记忆检索 (注入新会话)

当 `memories.use_memories = true`:
1. `memory_summary.md` 自动加载到 system prompt
2. 注入记忆读取提示: "You have access to a memory folder with guidance from prior runs."
3. **模型决定**是否基于当前任务搜索记忆文件
4. 使用计数追踪 (`usage_count`, `last_usage`) 影响未来优先级

---

## 核心设计原则

| 原则 | 实现 |
|------|------|
| **无状态请求** | 故意不用 `previous_response_id`，满足 Zero Data Retention 合规 |
| **线性成本** | Prompt 缓存将二次成本变为线性成本 |
| **有损但智能压缩** | `encrypted_content` 保留潜在理解而不保留完整 token |
| **最小信号闸门** | Phase 1 no-op gate — 模型认为无复用价值时输出空 |
| **渐进式披露** | 摘要始终加载，详细条目按需检索，原始证据按需深入 |
| **增量更新** | Phase 2 用 git-style diff，不全量重写 |

---

## 独特机制

1. **`encrypted_content`** — 压缩时保留模型"潜在理解"，远超文本摘要的信息保真度
2. **No-op 闸门** — LLM 判断会话有无复用价值，空输出 = 不产生记忆污染
3. **两阶段管道** — Phase 1 单次提取 + Phase 2 全局合并，分离关注点
4. **memory_summary.md** — 持久化导航索引，始终在 system prompt
5. **使用追踪** — 记忆被使用的次数影响后续优先级
