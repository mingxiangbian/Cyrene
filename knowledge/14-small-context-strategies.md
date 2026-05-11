# Small Context Window Strategies — 小窗口上下文管理

## 来源
- ReSum (arXiv 2509.13313) — 32K 窗口的周期性摘要
- AFM (arXiv 2511.12712) — 多保真度自适应记忆
- CSO (arXiv 2511.03728) — 端侧 SLM 的状态压缩
- Factory AI — 结构化迭代摘要评测
- OpenAI Agents SDK — Session Memory
- PAACE (arXiv 2512.16970) — 计划感知压缩

---

## 问题本质

Claude Code 依赖 200K 上下文窗口。本地模型通常只有 8K-32K。

| 场景 | Claude Code (200K) | 你的本地模型 (32K) | 差距 |
|------|-------------------|-------------------|------|
| System Prompt | ~20K tokens | ~5K tokens（需压缩 4×） | 必须精简 |
| 对话历史 | ~50K tokens | ~10K tokens | 必须主动管理 |
| 工具结果 | ~30K tokens | ~8K tokens | 需要外部化 |
| 子 Agent 上下文 | 独立 200K | 不可用 or 极简 | 可能无法使用 |

---

## 五大策略

### 策略 1: 滑动窗口 + 摘要注入（最简单）

```
[System Prompt (5K)] [摘要(2K)] [最近 8 轮 (8K)] [当前轮 (3K)]
                                              ↑ 17K total
```

- 触发条件：上下文达到 75% 窗口（如 32K → 24K 触发）
- 摘要在后台用更小的模型（2-3B）生成
- 摘要结构：决定、文件变更、待办事项、信息缺口

### 策略 2: 多保真度自适应记忆 (AFM)

每条消息分三级：

| 级别 | 处理 | Token 消耗 |
|------|------|-----------|
| FULL | 原文保留 | 高 |
| COMPRESSED | LLM 摘要 or 启发式压缩 | 中 |
| PLACEHOLDER | 短引用标记 | 极低 |

评分公式：语义相似度 (cosine) + 近因性 (半衰期) + 重要性分类 (CRITICAL/RELEVANT/TRIVIAL)

效果：**66% token 减少**，保留安全关键信息。

### 策略 3: 结构化迭代摘要 (Factory AI)

```markdown
## Intent
修复登录页面的 CSRF token 验证失败

## Decisions Made
- 在 middleware/auth.ts 中添加 CSRF token 验证
- 使用 double-submit cookie pattern

## Files Modified
- middleware/auth.ts (+45/-12)
- tests/auth.test.ts (+120)

## Test Results
- 15/15 测试通过

## Pending
- 更新 API 文档
```

比 Anthropic 的通用摘要高 0.26 分（3.70 vs 3.44）。

### 策略 4: 上下文状态对象 (CSO)

端侧专用方案——双 LoRA Adapter：
- **Executor LoRA** — 执行 Agent 任务
- **State-Tracker LoRA** — 每轮将对话压缩为结构化 CSO

效果：10-25× 上下文增长率降低，~80MB 内存，~500ms 延迟。

### 策略 5: 内存指针外部化

大型工具输出不保留在上下文中，改为：
```
Tool result saved to: /tmp/agent-outputs/file-list.json (2342 lines)
Reference by: output_ref://file-list
```

效果：~7× token 减少。

---

## 策略对比

| 策略 | Token 节省 | 复杂度 | 延迟 | 适用 |
|------|-----------|--------|------|------|
| 滑动窗口+摘要 | 60-80% | 低 | 摘要生成时有延迟 | 起步方案 |
| AFM 多保真度 | ~66% | 中 | 评分计算 | 安全敏感场景 |
| 结构化迭代摘要 | 98.6% | 中 | 摘要生成时 | 长会话 |
| CSO LoRA | 10-25× | 高（需训练） | ~500ms | 端侧 3B 模型 |
| 内存指针 | ~7× | 低-中 | 几乎零 | 大型工具输出 |

---

## 推荐策略组合

### 32K 窗口方案
```
1. 精简 System Prompt 到 5K
2. 滑动窗口：保留最近 8 轮原文 (~8K)
3. 结构化摘要：旧轮次压缩为 2K 摘要
4. 工具输出外部化：大结果写文件，上下文只保留引用
5. 75% 阈值触发压缩
```

### 8K 窗口方案（更激进）
```
1. 极简 System Prompt：1K（只含核心安全规则）
2. 滑动窗口：保留最近 3 轮 (~3K)
3. 关键信息提取替代摘要：只保留"决定"和"文件变更"
4. 所有工具输出外部化
5. 使用 RAG 检索历史决策
```

---

## 压缩触发的时机

不应等窗口满了再压缩——要有预警：

```
窗口使用率 50%: 开始精简旧工具输出
窗口使用率 75%: 触发历史摘要
窗口使用率 85%: 激进压缩所有非关键信息
窗口使用率 92%: 强制压缩（Claude Code 的硬限制）
```

---

## 压缩质量的验证

压缩后要验证关键信息没有丢失：

1. **决策保留检查** — 之前的决定是否还在？
2. **文件变更追踪** — 修改了哪些文件是否准确？
3. **待办一致性** — 未完成任务是否完整？
4. **NLI 逻辑一致性** — 压缩后的上下文是否与压缩前逻辑一致？

LLM-Agent+ 使用 BERT 分类器做显著性评分 + NLI 做逻辑一致性验证，可参考。
