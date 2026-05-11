# Local Agent Benchmarks — 选模型的量化依据

## 来源
- BFCL V4 (Berkeley Function Calling Leaderboard)
- SWE-rebench (Nebius)
- SambaNova Cross-Platform Study
- MCPToolBench++ (MCP Tool Use Benchmark)
- Mantella Benchmark (Function Calling)
- SLM Agent Survey (arXiv 2510.03847)

---

## 顶级基准：BFCL V4

bfcl_v4 是评测 Tool Calling 的黄金标准。

| 排名 | 模型 | 综合 | 单轮 AST | 多轮 | 组织 |
|------|------|------|---------|------|------|
| 14 | DeepSeek-V3.2 (Prompt+Thinking) | 56.73% | 85.52% | 44.88% | DeepSeek |
| 23 | Qwen3-235B-A22B (Prompt) | 52.15% | 90.33% | 44.62% | Qwen |
| 29 | Qwen3-32B (FC) | 48.71% | 88.77% | 47.87% | Qwen |
| 31 | Qwen3-235B-A22B (FC) | 47.99% | 37.40% | 45.38% | Qwen |
| 33 | Qwen3-32B (Prompt) | 46.78% | 90.27% | 43.25% | Qwen |

### 关键发现

1. **Qwen3 的 "Prompt" 模式比 "FC" (Function Calling) 模式好** — 单轮 AST 90%+ vs 37%
2. **多轮 Tool Calling 是所有人的弱项** — 最高才 47%
3. **Llama 4 没上榜** — 在 Tool Calling 方面明显落后

---

## SWE-rebench: Agent 编码任务

真实世界的 Agent 软件工程任务：

| 模型 | 成功率 |
|------|--------|
| DeepSeek-V3-0324 | 13.3% |
| DeepSeek-V3 | 11.4% |
| Qwen3-235B (no-thinking) | 10.5% |
| Qwen3-32B (no-thinking) | 10.5% |
| Llama-4-Maverick-17B | 7.6% |
| Llama-4-Scout-17B | 4.8% |

### 关键发现

1. **Thinking 模式反而不利于 Agent 任务** — Qwen3 no-thinking ≈ thinking
2. **DeepSeek-V3 在 SWE 任务上略微领先**
3. **17B Llama 显著弱于 32B Qwen**

---

## MCPToolBench++: MCP 工具使用

Qwen3-Coder 的表现：

| 领域 | AST 分 | Pass@1 |
|------|--------|--------|
| File System | 90.80% | 86.80% |
| Browser | 88.66% | 29.25% |
| Map | 78.30% | 30.54% |
| Finance | 73.20% | 28.60% |
| Search | 71.80% | 52.27% |

Qwen3-Coder **超越**了 GPT-4o 和 Claude Sonnet 3.7 在多个工具类别上的表现。

---

## 小模型可行性

### Qwen3 小模型 FT 后

| 模型变体 | BFCL 非实时综合 |
|---------|---------------|
| Qwen3-1.7B (base) | 29.73% |
| Qwen3-1.7B (fine-tuned) | 32.27% |

### Salesforce xLAM
- 100% 简单 Asana 工具任务（超过 Qwen3-30B 的 92%）
- 证明：专用小模型 > 通用大模型

---

## 本地部署推荐（2025）

### Tier 1: 最佳综合

| 模型 | 为什么 |
|------|--------|
| **Qwen3-32B (Prompt 模式)** | BFCL 单轮 90%+，Apache 2.0，中文最佳 |
| **Qwen3-Coder-30B** | 编码专用，MCP 工具使用领先 |
| **DeepSeek-V3.2** | 综合 BFCL 最高，SWE 任务最强 |

### Tier 2: 性价比

| 模型 | 为什么 |
|------|--------|
| **Qwen2.5-Coder-32B** | Mantella FC 84%，成熟稳定 |
| **Qwen3-8B** | 轻量，适合开发调试 |

### Tier 3: 实验性

| 模型 | 为什么 |
|------|--------|
| **QwQ-32B** | 推理 + Tool Call 并行，实验性强 |
| **DeepSeek-R1 适配版** | 推理深度最好，但 Tool Calling 需要魔改 |

---

## 平台选择的影响

SambaNova 的关键教训：

**同一 DeepSeek-V3 在不同平台上的 Tool Calling 差异高达 31pp：**

| 平台 | 单函数 | 多函数 | 多轮 |
|------|--------|--------|------|
| SambaNova | 98% | 95% | 35% |
| Fireworks | 94% | 94% | 13% |
| Together AI | 96% | 89% | 4% |

### 本地推理引擎的相对表现

虽然没有公开的本地引擎对比，基于社区经验：
- **SGLang** — 多轮对话最稳定（RadixAttention 保持上下文连贯性）
- **vLLM** — 单轮性能最稳定
- **Ollama** — 简单，但多轮 Tool Calling 稳定性不如 SGLang
- **llama.cpp** — 不推荐用于复杂 Agent 场景（Tool Calling 支持不完整）

---

## 选模型决策树

```
需要中文？
├── 是 → Qwen3-32B (Prompt 模式)
│          ├── 编码任务为主？ → Qwen3-Coder-30B
│          └── 通用 Agent？ → Qwen3-235B-A22B
└── 否 → DeepSeek-V3.2
           ├── 需要推理深度？ → DeepSeek-R1 适配版
           └── 需要小模型？ → Qwen2.5-7B

上下文窗口？
├── >= 32K → Qwen3 系列 (32K 原生)
├── 128K → DeepSeek-V3 (128K 原生)
└── <= 8K → 需要激进的上下文管理策略
```

---

## 实测建议

不要只看基准——在你的具体使用场景中测试：

1. **用 BFCL 测试集跑 Tool Calling 成功率** — `gorilla.cs.berkeley.edu`
2. **用你实际的 10-15 个工具定义测试** — 不是通用基准
3. **测多轮（5-10 轮）** — 这是最容易出问题的场景
4. **测参数格式正确率** — 不是"选对工具"就完了
5. **测边缘情况** — 空参数、同名工具、超长参数值
