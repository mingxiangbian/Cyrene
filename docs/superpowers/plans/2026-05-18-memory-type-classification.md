# Memory Type Classification 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。

**目标：** 为 MEMORY.md 索引行嵌入类型标记 `[type]`，实现 4 种记忆类型（user/feedback/project/reference）的分类

**架构：** 类型存储在 MEMORY.md 索引行中（不在 memory 文件 content 里），加载时从索引行正则解析，写入时通过 `compactMemories` 和 `writeMemoryEntry` 传递类型

---

### 任务 1：索引行格式变更 + 加载解析

**文件：** `src/memory.ts`、`tests/memory-load.test.ts`

**做什么：**

- 修改 `appendMemoryIndexEntry` — 索引行格式从 `- [title](file) — summary` 改为 `- [title](file) — [type] summary`
- 修改 `loadMemoryScope` — 加载正则从 `/^- \[([^\]]+)\]\(([^)]+)\) — .+$/` 改为支持可选 `[type]` 标记。旧格式行（无 `[type]`）向后兼容，不抛错
- 修改 `loadMemories` — 同步正则更改
- 修改内存文件加载时的 heading — 从 `## Memory: {title}` 改为 `## [{type}] {title}`，让 agent 看到每条记忆的类型

**关键约束：** 旧 MEMORY.md 文件无 type 标记时正常加载，不做迁移

**测试要点：** 带 type 的索引行正确解析、无 type 的旧行兼容、heading 包含类型信息、非法 type 值处理

Commit: `feat: embed memory type in MEMORY.md index lines`

---

### 任务 2：compactMemories — LLM 输出加 type

**文件：** `src/memory.ts`、`tests/memory-load.test.ts`

**做什么：**

- `CompactedMemoryEntry` 接口新增 `type: 'user' | 'feedback' | 'project' | 'reference'`
- `buildMemoryCompactionPrompt` 更新 JSON 格式和分类指引：
  - user: 用户偏好、角色、习惯
  - feedback: 用户纠正、行为规则
  - project: 项目决策、架构约定
  - reference: 外部系统链接
- `parseCompactedMemoryEntries` 解析并校验 type 必须是 4 个有效值之一，无效值抛错
- `validateCompactedMemoryEntries` 中增加 type 验证

**测试要点：** LLM 返回有效 type 正常解析、无效 type 抛错、prompt 包含分类指引

Commit: `feat: add memory type to compaction prompt and parser`

---

### 任务 3：writeMemoryEntry + updateMemoryIndex — 接受 type

**文件：** `src/memory.ts`、`tests/memory-load.test.ts`

**做什么：**

- `writeMemoryEntry` 的 entry 参数新增可选 `type` 字段，传给 `appendMemoryIndexEntry`
- `updateMemoryIndex` 的 entry 参数新增可选 `type` 字段，传给 `appendMemoryIndexEntry`
- type 为 undefined 时不写 `[type]` 标记（向后兼容）

**测试要点：** 带 type 写入后索引行包含 `[type]`、无 type 时索引行不包含 type 标记

Commit: `feat: accept type in writeMemoryEntry and updateMemoryIndex`

---

### 任务 4：集成测试 + 回归验证

**文件：** `tests/memory-load.test.ts`、`tests/memory-v2-integration.test.ts`

**做什么：**

- 更新所有已有测试中构造 MEMORY.md 内容的断言，适配新格式
- `compactMemories` 端到端测试：模拟 LLM 返回带 type 的 JSON → 写入 → 加载 → type 正确保留
- 向后兼容测试：旧格式索引行 + 新格式索引行混合加载

**关键约束：** 全部已有测试必须通过

**测试要点：** 所有已有测试通过、新格式加载正确、混合格式兼容

Commit: `test: update tests for memory type classification`

---

## 变更总结

| 文件 | 变更 |
|------|------|
| `src/memory.ts` | `CompactedMemoryEntry` +type, `buildMemoryCompactionPrompt` 改 prompt, `parseCompactedMemoryEntries` 解构 type, `appendMemoryIndexEntry` 改格式, `loadMemoryScope` 改正则 |
| `tests/memory-load.test.ts` | 更新 MEMORY.md 断言 + 新格式/兼容性测试 |
| `tests/memory-v2-integration.test.ts` | 端到端 type 保留测试 |
