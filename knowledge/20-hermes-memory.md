# Hermes Agent 记忆系统

## 来源
- DeepWiki: NousResearch/hermes-agent, 4.3 Memory and Sessions
- Zhihu/CSDN 源码分析文章
- Vectorize.io: How Hermes Agent Memory Actually Works

---

## 四层架构

| 层 | 名称 | 存储位置 | 用途 |
|------|------|---------|------|
| L1 | Prompt Memory (热记忆) | `MEMORY.md` (2200 字符) + `USER.md` (1375 字符) | 始终在上下文中的持久事实 |
| L2 | Session Archive (冷记忆) | SQLite + FTS5 (`state.db`) | 全文搜索的完整对话 |
| L3 | Skills (程序记忆) | `~/.hermes/skills/*.md` | 可复用、自我改进的任务工作流 |
| L4 | External Provider (可选) | 可插拔 (Honcho, Mem0, Hindsight 等) | 结构化提取、实体解析 |

---

## 文件结构

```
~/.hermes/memories/
  MEMORY.md     ← Agent 个人笔记 (2200 字符上限)
  USER.md       ← 用户档案 (1375 字符上限)
~/.hermes/skills/*.md   ← 可复用工作流
~/.hermes/state.db      ← SQLite + FTS5 全文搜索
```

多 agent 场景中位于各 agent 的 profile 目录下。

---

## 冻结快照机制 (Frozen Snapshot)

**最独特的设计特性** — 为保护前缀缓存稳定性：

```
会话启动时:
  MemoryStore.load_from_disk()
    → 从磁盘读取 MEMORY.md 和 USER.md
    → 捕获冻结快照 (_system_prompt_snapshot)
    → 快照注入 system prompt
    → 整个会话期间永不变更

会话中的写入 (通过 memory 工具):
  → 立即持久化到磁盘
  → 但不在 system prompt 中反映，直到下次会话

唯一例外: 上下文压缩（对话超过窗口）
  → 触发快照刷新（缓存无论如何已失效）
```

**为什么冻结？** 保护 Anthropic 的 prompt 前缀缓存，节省 ~75% token 费用。`system_and_3` 缓存策略要求 prompt 前缀稳定。

源码 (`tools/memory_tool.py`):
```python
def load_from_disk(self):
    self.memory_entries = self._read_file(mem_dir / "MEMORY.md")
    self.user_entries = self._read_file(mem_dir / "USER.md")
    self._system_prompt_snapshot = {
        "memory": self._render_block("memory", self.memory_entries),
        "user": self._render_block("user", self.user_entries),
    }
```

---

## 容量限制

| 文件 | 上限 | 约合 Token | 超限行为 |
|------|:---:|:---:|------|
| MEMORY.md | 2,200 字符 | ~800 tokens | `add()` 失败，agent 必须 `replace`/`remove` |
| USER.md | 1,375 字符 | ~500 tokens | 同上 |

**条目分隔符：** `§` (section sign) — `ENTRY_DELIMITER = "\n§\n"`

**原子写入：** temp-file + rename + `fcntl.flock()` 文件锁保证并发安全。

**安全：** 写入时检测 prompt 注入模式（"ignore previous instructions", "you are now" 等）。

---

## Memory 工具

单一工具，多 action 参数：
- `add` — 添加条目
- `replace` — 替换条目
- `remove` — 删除条目
- 目标: `memory` (MEMORY.md) 或 `user` (USER.md)

Schema 包含大量行为引导：何时保存、优先级、什么不值得保存。

---

## Periodic Nudge 引擎 (周期性反思提醒)

两个计数器 (来自 `run_agent.py`):
- `_memory_nudge_interval`: 默认每 10 个用户轮次
- `_skill_nudge_interval`: 默认每 10 次迭代

**流程：** 计数器达到阈值时，agent fork 一个后台 AIAgent 实例 (`_spawn_background_review()`):
- stdout/stderr 重定向到 /dev/null (用户不可见)
- 上限 8 次迭代
- 自身 nudge 禁用（避免无限递归）
- 共享同一 `_memory_store` — 写入立即生效
- 使用专门的反思 Prompt
- 每次 Prompt 末尾: "If nothing is worth saving, just say 'Nothing to save.' and stop."

---

## 生命周期 Hooks (MemoryProvider ABC)

| Hook | 触发时机 | 用途 |
|------|---------|------|
| `on_turn_start` | 每轮开始 | 轮次计数，定期维护 |
| `on_session_end` | 会话结束 | 终端提取、摘要 |
| `on_pre_compress` | 压缩前 | 从即将丢弃的上下文中提取洞察 |
| `on_memory_write` | 内置记忆写入 | 镜像/同步内置记忆 |
| `on_delegation` | 子 agent 完成 | 观察委托任务结果 |

### on_pre_compress Hook (关键机制)

允许记忆 provider 在压缩/截断前从对话上下文中提取和保存关键洞察。返回一个字符串注入到摘要 prompt 中：

```python
def on_pre_compress(self, messages) -> str:
    """返回要保存的关键信息，注入到摘要 prompt 中"""
```

---

## findings_to_wiki (提议特性)

内容检测层，自动填充 MEMORY.md：
1. 每次对话后自动填充 (短事实: 时间戳 + 主题 + 关键洞察)
2. 通过正则模式自动检测结构化发现 (如 "## Findings", "## Decision")

零外部依赖（纯正则，每轮零 LLM 成本）。约 150 行 Python。

---

## 记忆 vs 技能 的分离

| | Memory | Skills |
|------|--------|--------|
| 内容 | 陈述性事实 | 可执行程序 |
| 形式 | 偏好、知识、决策 | 工作流、操作模板 |
| 管理 | Agent 精选 | 自我改进 |
| 系统 | 独立系统 | 独立系统 |

---

## 核心设计哲学

**"认知经济性"** — 只记住对未来行为有价值的信息。三条原则：
1. **容量驱动反思** — 空间满了才强迫反思，不主动写
2. **Agent 精选而非自动捕获** — Nudge 只是提醒，Agent 决定什么值得保留
3. **冻结快照** — 用不可变性换取前缀缓存稳定性

---

## 核心优势

1. **冻结快照** — 保护前缀缓存，节省 75% token
2. **硬容量限制** — 空间满了强迫 agent 做取舍
3. **后台 Nudge** — 不阻塞用户，无声运行
4. **on_pre_compress 抢救** — 压缩前最后一道防线
5. **agent 精选** — 不是盲目自动捕获，由 agent 判断价值
