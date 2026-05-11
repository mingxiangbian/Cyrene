# Local Model Tool Calling — 本地模型适配方案

## 来源
- BFCL V4 Leaderboard (Berkeley Function-Calling)
- SambaNova: Same Model, Three Platforms benchmark
- LangChain / Ollama / vLLM 官方文档
- 社区实践（Dify, AGNO, Google ADK）

---

## 本地模型 Tool Calling 支持一览（2025）

| 模型 | Tool Calling | 推荐大小 | 中文场景 | 注意事项 |
|------|-------------|---------|---------|---------|
| **Qwen3-Coder** | 原生 | 30B | 最佳 | BFCL 工具分 ~92%，MCPToolBench 领先 |
| **Qwen3-32B** | 原生 (Prompt 模式) | 32B | 极佳 | 单轮 AST 90.33%，Prompt 模式比 FC 模式好 |
| **Qwen2.5-Coder** | 原生 | 7B/32B | 优秀 | Mantella FC 84%，最佳纯本地模型 |
| **DeepSeek-V3.2** | 原生 | 671B (MoE) | 良好 | BFCL Overall 56.73%，多轮 44.88% |
| **DeepSeek-chat** | 原生 (OpenAI 兼容) | - | 良好 | 通过 LiteLLM 适配 |
| **DeepSeek-R1** | 需适配版 | - | 一般 | 原生不支持 tool call，需 `MFDoom/deepseek-r1-tool-calling` |
| **Llama 4 Maverick** | 原生 | 17B | 弱 | SWE-rebench 7.6%，BFCL 未上榜 |
| **QwQ-32B** | 支持 | 32B | 良好 | vLLM `deepseek_r1` parser |

### 核心结论

> **中文 + Tool Calling 场景 → Qwen3 系列是最佳选择。**

---

## 三种适配路径

### 路径 1：框架层统一适配（推荐起步）

```python
# LangChain — 自动适配不同模型的 tool call 格式
from langchain_community.chat_models import ChatOllama

llm = ChatOllama(model="qwen3:32b")
llm_with_tools = llm.bind_tools([
    {
        "name": "read_file",
        "description": "Read a file from the filesystem",
        "parameters": {
            "type": "object",
            "properties": {
                "file_path": {"type": "string"}
            }
        }
    }
])
```

可用框架：
- **LangChain** — 生态最成熟，`bind_tools` 自动适配格式
- **Dify** — 低代码可视化，适合快速搭建
- **Google ADK** — LiteLLM 统一适配层，企业级
- **AGNO** — 轻量级，直接支持 Ollama 本地模型

### 路径 2：OpenAI 兼容 API（推荐生产）

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:11434/v1",  # Ollama
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="qwen3:32b",
    messages=[...],
    tools=[{
        "type": "function",
        "function": {
            "name": "bash",
            "description": "Execute a shell command...",
            "parameters": { "type": "object", "properties": {...} }
        }
    }]
)
```

关键引擎选择：
- **Ollama** — 最简单，适合开发和测试
- **vLLM** — 生产级，支持 prefix caching、reasoning parser
- **SGLang** — 多轮对话最优，RadixAttention 自动复用 KV Cache

### 路径 3：手动 Prompt 注入（兜底方案）

当模型不支持原生 tool calling 时：

```python
tool_schema = """
<tools>
<tool name="read_file">
<description>Read a file from the filesystem</description>
<parameters>
- file_path (string, required): Absolute path to the file
</parameters>
</tool>
</tools>

<output_format>
如果使用工具，返回：
{"tool": "read_file", "parameters": {"file_path": "/path/to/file"}}

如果不使用工具，返回纯文本。
</output_format>
"""

system_prompt = f"{base_system_prompt}\n\n{tool_schema}"
```

---

## 平台对 Tool Calling 的影响

SambaNova 的关键发现：**同一模型在不同平台上 Tool Calling 差异达 30+ 百分点**。

| 场景 | DeepSeek-V3 最佳 | DeepSeek-V3 最差 | 差距 |
|------|-----------------|-----------------|------|
| 单函数 | 98% | 94% | 4pp |
| 多函数 | 95% | 89% | 6pp |
| 多轮对话 | 35% | 4% | **31pp** |

### 原因
- **内存管理**：KV Cache 保持影响多轮对话的上下文连续性
- **工具解析器**：不同平台的 JSON Schema 解析器实现不同
- **输出格式化**：结构化输出的 token 概率分布受推理引擎影响

### 适配建议
- 用 vLLM 或 SGLang，不要用最基础的 llama.cpp（工具调用支持不完整）
- 测试你的具体推理引擎的 tool call 成功率
- 多轮对话是最容易出问题的地方

---

## 本地模型 Tool Calling 的特殊挑战

### 1. 工具选择准确性低
Claude Code 有 66+ 工具可选，本地模型可能选错工具：
- **解决方案**：减少可用工具数量（从 66 减到 10-15 个核心工具）
- 工具按场景分组，只在相关时暴露

### 2. 参数提取不精确
本地模型提取的参数可能格式错误或缺少必需字段：
- **解决方案**：在工具执行前加 Zod/Pydantic 验证
- 参数错误时返回明确的错误消息（不要默默修复）

### 3. 多轮一致性问题
本地模型在多轮对话中容易"忘记"之前选的工具或用错的参数：
- **解决方案**：SGLang 的 RadixAttention 是最佳引擎选择
- 在多轮场景中显式在 Prompt 中包含最近 2-3 轮的工具调用历史

### 4. 过度调用/调用不足
本地模型要么不调用工具（试图用文字回答），要么疯狂调用：
- **解决方案**：在 System Prompt 中明确说明何时该用工具、何时不该用
- 设置 max_tool_calls_per_turn（如 5）

---

## 推荐技术栈

```
推理引擎:     vLLM (生产) / Ollama (开发) / SGLang (多轮对话优先)
模型:         Qwen3-32B (主) + Qwen2.5-Coder-7B (辅)
适配层:       LiteLLM (OpenAI 兼容) / LangChain bind_tools
验证:         Zod Schema (参数校验) + BFCL 测试集
监控:         Tool call 成功率 / 平均调用次数 / 参数错误率
```
