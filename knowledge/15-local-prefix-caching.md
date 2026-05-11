# Local Prefix Caching — 本地模型的 Prompt Cache 替代方案

## 来源
- vLLM Automatic Prefix Caching 文档
- SGLang RadixAttention 设计文档
- LMCache: KV 缓存复用方案
- RunPod: SGLang vs vLLM multi-turn comparison
- CAG (Cache-Augmented Generation)

---

## Anthropic Prompt Cache vs 本地替代

| 维度 | Anthropic API | 本地 vLLM | 本地 SGLang |
|------|-------------|-----------|------------|
| 缓存机制 | 显式 `cache_control` 标记 | 自动哈希块匹配 | Radix 树最长前缀匹配 |
| TTL | 5 分钟 | 直到 LRU 驱逐 | 直到 LRU 驱逐 |
| 写入成本 | 1.25× | 无额外成本 | 无额外成本 |
| 读取成本 | 0.10× (90% 折扣) | 零（KV 复用） | 零（KV 复用） |
| 存储 | GPU HBM | GPU/CPU/Disk 分层 | GPU |
| 匹配方式 | 精确前缀 | 精确块级前缀 | 任意共享前缀 |

---

## vLLM: 自动前缀缓存 (APC)

### 工作原理
```
请求: "You are an agent. Read the file at /src/app.ts"
       |______ 前缀 ______||______ 新内容 _______|
       
       → 前缀部分的 KV Cache 直接复用
       → 只需计算新内容部分的 KV
```

- 基于哈希的块级缓存（每块 16 tokens）
- SHA256 哈希（100-200ns/token，零碰撞）
- 双向链表 LRU 驱逐（O(1)）
- Cache Salt 实现多租户隔离

### 启动命令
```bash
vllm serve Qwen/Qwen3-32B \
  --enable-prefix-caching \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90
```

### 最适合的场景
- **批处理推理** — 模板化 Prompt
- **可预测的请求模式** — System Prompt + 少量变化
- **多用户相同 System Prompt** — 所有用户共享缓存前缀

### Cache Salt 隔离
```python
# 不同"文档"用不同 salt，避免缓存污染
response = client.chat.completions.create(
    model="qwen3-32b",
    messages=[...],
    extra_body={"cache_salt": "project-a"}  # 仅 project-a 的请求共享此缓存
)
```

---

## SGLang: RadixAttention

### 工作原理
```
请求 A: "You are an agent. Read /src/app.ts"
请求 B: "You are an agent. Read /src/utils.ts"
        |______ 共享路径 ______|
        
        → Radix 树自动找到最长公共前缀
        → 两个请求自动共享公共部分的 KV Cache
```

- 基于 Radix Tree (Trie) 结构
- 自动最长前缀匹配（不需要显式标记）
- LRU 从叶节点驱逐
- **零配置**，开箱即用

### 最适合的场景
- **多轮对话** — 每轮都是前一"轮"的变体
- **Agent 工具调用** — 工具调用结果不同但前缀相同
- **分支对话** — Tree-of-Thoughts 等复杂模式
- **不可预测的对话流** — 自动适应

---

## Head-to-Head

| 维度 | vLLM APC | SGLang RadixAttention |
|------|---------|---------------------|
| 数据结构 | 哈希表 | Radix 树 (Trie) |
| 匹配粒度 | 精确块级前缀 | 任意共享 token 前缀 |
| 多轮对话 | 需要精确重新构造 Prompt；小变化可能丢失缓存 | 自动复用累积的上下文 |
| 基准速度 | 单轮快一点 | 多轮 10-20% 更快 |
| 配置复杂度 | 需要 `--enable-prefix-caching` | 零配置 自动启用 |
| 生态成熟度 | 更大、更多生产部署 | 快速增长 |

### 选择建议
- **vLLM**：批处理、模板化 Prompt、需要 Cache Salt 隔离
- **SGLang**：多轮对话、Agent 循环、Tool Calling 分支
- **混合**：LMCache 为 vLLM 添加持久化分层

---

## LMCache: 分层缓存

```
GPU HBM (热缓存, ~100GB/s)
  → CPU RAM (温缓存, ~50GB/s)
    → NVMe SSD (冷缓存, ~7GB/s)
```

- 请求先查 GPU → 未命中查 CPU → 未命中查 SSD → 全未命中重新计算
- 磁盘缓存可在重启后复用
- 3-10× TTFT（Time-To-First-Token）提升

```bash
pip install lmcache
vllm serve Qwen/Qwen3-32B --enable-prefix-caching
# LMCache 自动 hook，无需额外配置
```

---

## 针对 Agent 场景的缓存策略

### Agent 循环的缓存模式

```
Turn 1: [SysPrompt] [Context] "Read the file"
Turn 2: [SysPrompt] [Context] [T1 result] "Edit the file"
Turn 3: [SysPrompt] [Context] [T1 result] [T2 result] "Run tests"

SysPrompt + Context 在所有 Turn 间共享 → 缓存命中
T1 result 在 Turn 2 和 3 共享 → 缓存命中
```

### 子 Agent 的缓存优化

Claude Code 的 Fork Subagent 提示：
> "Forks are cheap because they share your prompt cache."

本地模型同理：
1. 子 Agent 共享主 Agent 的 System Prompt 前缀 → 缓存命中
2. Fork 时不换 model → 继续复用缓存
3. SGLang 的 Radix 树自动处理分支

### 工具回复的缓存

最理想的结构：
```
[System Prompt (可缓存)]
[Tool Definitions (可缓存, 按工具名排序)]
[User Context (部分可缓存)]
[Conversation History (不可缓存)]
[Current Turn (不可缓存)]
```

---

## 实际预期

| 场景 | 无缓存 | vLLM APC | SGLang | 备注 |
|------|--------|---------|--------|------|
| 首次调用 | 1× | 1× | 1× | 冷启动 |
| 相同 System Prompt 重调用 | 1× | 0.3× | 0.3× | 前缀复用 |
| 多轮 Agent 对话（10 轮） | 1× | 0.5× | 0.4× | SGLang 优势 |
| 并行子 Agent（3 个） | 3× | 1.5× | 1.2× | 共享前缀 |

> Anthropic 的 90% 成本折扣在本地模型上对应的是 **免费**（KV Cache 在本地 GPU 上复用）。这是本地模型的巨大优势。
