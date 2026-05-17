# OpenClaw 记忆系统

## 来源
- Web 搜索 OpenClaw Memory Management / Dreaming system 技术分析
- DeepWiki: OpenClaw Memory System
- OpenClaw 官方文档和社区分析 (2026.4.9 版本)

---

## 三层记忆架构

| 层 | 文件 | 用途 | 生命周期 |
|------|------|------|---------|
| L1: Session | `sessions/*.jsonl` | 完整对话历史（含工具调用） | 压缩后保留 |
| L2: Daily Notes | `memory/YYYY-MM-DD.md` | 追加式每日日志 — 决策、任务进度、临时上下文 | 跨会话，按日期归档 |
| L3: Persistent | `MEMORY.md` | 精选长期知识：偏好、项目规则、API 文档 | 永久；手动或 agent 精选 |

**关键规则：** MEMORY.md 只在主私密会话中加载——不在群组上下文中加载（安全考虑）。

---

## Dreaming 梦境系统 (后台记忆巩固)

**Opt-in，默认禁用。** 通过受管理的 cron 作业运行（默认凌晨 3:00）。设计受人类睡眠架构启发。

### Phase 1: Light Sleep (排序与分级) — 不写 MEMORY.md

- 摄取最近日记忆文件 (`memory/YYYY-MM-DD.md`) 和会话转录
- 使用 Jaccard 相似度去重（阈值: 0.9）
- 在短期回记忆存储中暂存候选项
- 记录"轻睡眠信号命中"（给深睡眠排名小幅加成）

### Phase 2: REM Sleep (反思与模式提取) — 不写 MEMORY.md

- 回看窗口（默认 7 天）内的暂存材料
- 分析概念标签频率，识别反复出现的主题
- 识别"候选真理" — 高频出现且置信度较高的条目
- 记录 REM 信号命中（给深睡眠排名额外加成）

### Phase 3: Deep Sleep (晋升到长期记忆) — 唯一写入 MEMORY.md 的阶段

- 从回记忆存储中获取所有候选项
- 使用 6 维加权评分模型打分
- 加上 Phase 1/2 的相位增强加成
- 通过三道闸门过滤
- 从实时日文件中重新水化片段（跳过已删除内容）
- 将通过者以日期分段写入 MEMORY.md

---

## 6 维评分模型

| 信号 | 权重 | 衡量什么 |
|------|:---:|------|
| **相关性 (Relevance)** | 0.30 | 所有回记忆的平均检索质量 — 最重要 |
| **频率 (Frequency)** | 0.24 | 累计短期信号数量 |
| **查询多样性 (Query Diversity)** | 0.15 | 不同查询/上下文出现的次数 |
| **时效性 (Recency)** | 0.15 | 时间衰减新鲜度（默认 14 天半衰期） |
| **巩固度 (Consolidation)** | 0.10 | 跨天重复出现强度 |
| **概念丰富度 (Conceptual)** | 0.06 | 片段/路径中的概念标签密度 |

**相位增强加成（在基础分之上）：**
- Light Sleep 命中: +0.05 (时间衰减)
- REM Sleep 命中: +0.08 (时间衰减)

---

## 三道晋升闸门 — 全部通过才能写 MEMORY.md

| 闸门 | 默认值 | 含义 |
|------|--------|------|
| minScore | 0.80 | 加权综合分必须 ≥ 0.80 |
| minRecallCount | 3 | 必须至少被回记忆 3 次 |
| minUniqueQueries | 3 | 必须来自至少 3 个不同查询 |

**为什么三道门？** 防止一次性提及被晋升。记忆必须展示持续的、跨不同场景的关联性。

---

## Dreaming 写入内容

1. 机器状态 → `memory/.dreams/` (回记忆存储、阶段信号、摄入检查点、锁文件)
2. 人类可读输出 → `DREAMS.md` (每阶段叙述式梦境日记条目)
3. MEMORY.md → 仅 Deep Sleep 阶段，晋升条目的追加

---

## Memory Flush (上下文压缩前抢救)

当会话接近上下文窗口限制时，在 compaction **破坏数据之前**触发一次静默 agent 轮次。

**触发：** `threshold = contextWindow - reserveTokensFloor - softThresholdTokens = 200k - 20k - 4k = 176k tokens`

**流程：**
1. Gateway 的 `shouldRunMemoryFlush()` 检查 token 用量
2. 静默注入 system prompt: "Session nearing compaction. Store durable memories now."
3. LLM 决定什么重要，调 `write_file` 保存到日记忆
4. Agent 回复 `NO_REPLY`（用户永远看不到这一轮）
5. 更新 `sessions.json` 元数据

**防护栏：** 每次压缩周期一次 flush；只读工作区跳过；非主会话跳过。

---

## 混合搜索 (BM25 + Vector)

`memory-core` 插件: BM25 关键词 (SQLite FTS5) + Vector 相似度 (`sqlite-vec`)，RRF 融合。

- Vector 擅长释义 ("Mac Studio gateway host" ≈ "网关机器")
- BM25 擅长精确匹配 (ID、代码符号、错误字符串)
- 默认权重: vectorWeight=0.7, textWeight=0.3
- Embedding providers: local → OpenAI → Gemini → Voyage → Mistral (自动选择链)

---

## 核心优势

1. **睡眠启发式三阶段合并** — 模仿人类记忆在睡眠中的巩固过程
2. **6 维加权评分** — 可配置的多维度质量门槛
3. **三道晋升闸门** — 持续性 + 多样性 + 相关性三重验证
4. **压缩前抢救 (Memory Flush)** — 主动在压缩破坏数据前保存
5. **DREAMS.md 审计** — 人类可读的自动晋升决策记录
