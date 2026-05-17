# Claude Code 记忆系统深度

> 补充 05-context-management.md，聚焦记忆的**写入决策、更新机制、KAIROS/Auto Dream**

## 来源
- 泄露源码 v2.1.88 npm 包分析
- GitHub: VILA-Lab/Dive-into-Claude-Code
- 社区逆向分析

---

## 三层记忆作用域

CC 有**三个独立的记忆作用域**，避免项目记忆和个人记忆混合：

| 作用域 | 路径 | 可见性 |
|--------|------|--------|
| User-level | `~/.claude/memory/` | 跨项目，个人 |
| Project-level | `/project/.claude/memory/` | 团队共享，git 跟踪 |
| Local-level | `/project/.claude/memory-local/` | 私有，不提交 |

---

## 记忆写入的两种路径

### 1. CLAUDE.md — 用户手动

三个层级：
- 项目根 `CLAUDE.md` — 进 git，团队共享
- 项目 `.claude/CLAUDE.md` — 不进 git，项目私有
- 用户 `~/.claude/CLAUDE.md` — 全局

内容由用户手动编写：项目规则、代码风格、测试命令。

### 2. Auto Memory — Agent 自主写入

Agent 在对话中**自主决定**何时写入记忆文件到 `memory/`。分类为 4 种类型：
- `user_*.md` — 用户角色、偏好
- `feedback_*.md` — 行为准则（来自用户纠正）
- `project_*.md` — 项目决策、上下文
- `reference_*.md` — 外部系统指针

每写入一个 `.md` 文件，同时在 `MEMORY.md` 追加一行索引（≤150 字符）。

**Agent 将自己的记忆视为"提示，非事实"** — 行动前会对照真实代码验证。

---

## Auto Dream (自动梦境)

当 agent **空闲 ≥ 24 小时且新增 ≥ 5 个 session** 时自动触发。也可手动输入 "dream" 触发。

### 三项操作

| 操作 | 说明 |
|------|------|
| **合并 (Merge)** | 将多个 session 的观察分散到统一表示中 |
| **冲突解决 (Resolve)** | 识别和消解矛盾记忆 |
| **试探→绝对 (Tentative→Absolute)** | 移除不确定性语言，将试探性观察晋升为"已知事实" |

System prompt: "You are performing a dream — a reflective pass over your memory files."

---

## 记忆检索方式

**不是向量搜索，不是 embedding，不是 RAG。**

CC 用 **Sonnet 侧查询** (`findRelevantMemories()`):

1. 扫描 memory 目录下所有 `.md` 文件
2. 只读文件名和描述（不读全文）
3. 发给 Sonnet 模型，让它挑出最多 **5 个** 最相关的文件
4. 这 5 个文件的内容加载到上下文中
5. 主 agent 在选中的文件中用 grep-like 关键词匹配查找信息

### 为什么不用向量搜索？

可能的原因：
- 文件量小（200 行索引上限），线性扫描够用
- 语义关联由 LLM 判断，不依赖 embedding 质量
- 简化架构，减少外部依赖
- 可以离线，不需要 embedding 服务

### 检索限制的影响

- 文本搜索难以跨语义匹配（"端口冲突" 搜不到 "docker-compose mapping"）
- 196 个文件在任意查询中不可见，依赖摘要覆盖
- 随着索引增长，旧条目被推出，检索丢失率上升

---

## MEMORY.md 容量限制

| 限制 | 值 | 影响 |
|------|:---:|------|
| 索引行数 | 200 行 | 超出行在 system prompt 中不可见 |
| 每行长度 | 150 字符 | 摘要必须极度精简 |
| 每次查询检索 | 5 个文件 | 其他 195 个在查询中不可见 |

**淘汰策略：** 新行覆盖旧行（最新优先）。没有按重要性/时效性排序。

---

## KAIROS (未发布的特性开关)

编译时常量，泄露源码中引用 150+ 次。将 CC 从"请求-响应 CLI" 转变为**长期运行的 OS 级守护进程**。

### 关键特性

| 特性 | 说明 |
|------|------|
| **守护进程模式** | 终端关闭后持续运行；维护追加式每日观察日志 |
| **Tick 架构** | 周期性 `<tick>` 心跳强制模型评估状态；长任务推入后台队列 |
| **观察-思考-行动循环** | 用 inotify/FSEvents/ReadDirectoryChangesW 监控文件系统；同时监控终端输出、shell 历史、git 状态、构建/测试 IPC 信号 |
| **主动行为** | PROACTIVE 标志：主动呈现"用户没要求但现在需要看到的"信息 |
| **独占工具** | 推送文件、发送通知、监控 GitHub PR（普通 CC 无此能力） |
| **成本感知休眠** | 计算 API 上下文缓存何时过期；精确休眠到过期前一刻；醒来刷新上下文 |
| **15 秒规则** | 任何阻塞用户超过 15 秒的操作自动推迟 |
| **内存消耗** | 空闲时 ~15GB；活跃时 8-9 倍 |

### KAIROS 与现有记忆的关系

- `autoDream` 集成：用户空闲或 session 结束时运行 dream 流程
- 扫描转录文件寻找新信息
- 移除近似重复/矛盾
- 修剪过期条目
- 合成持久记忆

---

## 与 cc-local 的对比

| 特性 | CC | cc-local |
|------|:--:|:--:|
| 记忆作用域 | 3 层 (user/project/local) | 1 层 |
| 记忆写入 | Agent 自主 + 用户手动 | 用户手动 |
| 记忆时效 | Auto Dream 自动合并 | 无 |
| 检索方式 | Sonnet 侧查询 | grep/线性扫描 |
| CLAUDE.md 层级 | 4 级向上递归 | 1 级 |
| 容量管理 | 200 行索引上限 | 无 |
| 后台进程 | KAIROS 守护进程 | 无 |
