# Context & Memory 升级 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为 cc-local 实现完整记忆系统（MEMORY.md + 4 种类型 + 会话摘要）和 Auto-Compact 上下文压缩（token 超 70% 阈值时 LLM 摘要替换旧消息）

**架构：** 扩展 memory.ts（+3 个函数）和 context.ts（+1 个函数），在 main.ts 启动时注入记忆到 System Prompt，在 repl.ts 退出时生成会话摘要，在 agent-loop.ts 每次 LLM 调用前检查 token 阈值并触发压缩

**技术栈：** TypeScript, Vitest, Node.js fs/promises, 本地 Qwen3.5-9B

---

### 任务 1：Config — 新增窗口和阈值配置项

**文件：**
- 修改：`src/config.ts`

- [ ] **步骤 1：添加 `contextWindowTokens` 和 `autoCompactThreshold` 到 AppConfig**

```typescript
export interface AppConfig {
  cwd: string
  model: ModelConfig
  maxToolCallsPerTurn: number
  readMaxInlineLines: number
  grepMaxMatches: number
  bashTimeoutMs: number
  llmRequestTimeoutMs: number
  llmRetryMaxAttempts: number
  llmRetryBaseDelayMs: number
  writableRoots: string[]
  bashDenyPatterns: RegExp[]
  contextWindowTokens: number
  autoCompactThreshold: number
}
```

- [ ] **步骤 2：在 `createDefaultConfig` 中添加默认值**

```typescript
export function createDefaultConfig(cwd: string): AppConfig {
  return {
    // ... 已有字段不变
    contextWindowTokens: 256_000,
    autoCompactThreshold: 0.7
  }
}
```

- [ ] **步骤 3：运行类型检查确认无编译错误**

```bash
npx tsc --noEmit
```

- [ ] **步骤 4：Commit**

```bash
git add src/config.ts
git commit -m "feat: add contextWindowTokens and autoCompactThreshold to config"
```

---

### 任务 2：Memory — loadMemories — 解析 MEMORY.md 并加载记忆文件

**文件：**
- 创建：`tests/memory-load.test.ts`
- 修改：`src/memory.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadInstructionsIfExists, loadMemories } from '../src/memory.js'

const tempDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cc-local-memory-'))
  tempDirs.push(dir)
  return dir
}

describe('loadMemories', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('returns empty string when .cc-local/memory/ does not exist', async () => {
    const root = await createTempDir()

    await expect(loadMemories(root)).resolves.toBe('')
  })

  it('returns empty string when MEMORY.md is empty', async () => {
    const root = await createTempDir()
    await mkdir(join(root, '.cc-local', 'memory'), { recursive: true })
    await writeFile(join(root, '.cc-local', 'memory', 'MEMORY.md'), '')

    await expect(loadMemories(root)).resolves.toBe('')
  })

  it('loads and formats memory files referenced in MEMORY.md', async () => {
    const root = await createTempDir()
    const memoryDir = join(root, '.cc-local', 'memory')
    await mkdir(memoryDir, { recursive: true })
    await writeFile(
      join(memoryDir, 'MEMORY.md'),
      '- [User Style](user-style.md) — coding preferences\n- [Project Design](project.md) — architecture decisions\n'
    )
    await writeFile(join(memoryDir, 'user-style.md'), 'Use single quotes.\n')
    await writeFile(join(memoryDir, 'project.md'), 'Use functional style.\n')

    const result = await loadMemories(root)
    expect(result).toContain('## Memory: User Style')
    expect(result).toContain('Use single quotes.')
    expect(result).toContain('## Memory: Project Design')
    expect(result).toContain('Use functional style.')
  })

  it('skips malformed lines in MEMORY.md', async () => {
    const root = await createTempDir()
    const memoryDir = join(root, '.cc-local', 'memory')
    await mkdir(memoryDir, { recursive: true })
    await writeFile(
      join(memoryDir, 'MEMORY.md'),
      '- [Valid](valid.md) — ok\nthis line has no link\n- [Also Valid](also.md) — also ok\n'
    )
    await writeFile(join(memoryDir, 'valid.md'), 'valid content\n')
    await writeFile(join(memoryDir, 'also.md'), 'also content\n')

    const result = await loadMemories(root)
    expect(result).toContain('valid content')
    expect(result).toContain('also content')
  })

  it('skips memory files that do not exist', async () => {
    const root = await createTempDir()
    const memoryDir = join(root, '.cc-local', 'memory')
    await mkdir(memoryDir, { recursive: true })
    await writeFile(
      join(memoryDir, 'MEMORY.md'),
      '- [Missing](missing.md) — gone\n- [Present](present.md) — here\n'
    )
    await writeFile(join(memoryDir, 'present.md'), 'present content\n')

    const result = await loadMemories(root)
    expect(result).toContain('present content')
    expect(result).not.toContain('Missing')
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx vitest run tests/memory-load.test.ts
```
预期：FAIL，`loadMemories is not a function` 或 `Property 'loadMemories' does not exist`

- [ ] **步骤 3：实现 `loadMemories`**

在 `src/memory.ts` 中添加：

```typescript
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

interface MemoryEntry {
  title: string
  file: string
  summary: string
}

export async function loadMemories(cwd: string): Promise<string> {
  const indexPath = join(cwd, '.cc-local', 'memory', 'MEMORY.md')
  let indexContent: string
  try {
    indexContent = await readFile(indexPath, 'utf8')
  } catch (error) {
    if (isMissingFileError(error)) {
      return ''
    }
    throw error
  }

  const entries = parseMemoryIndex(indexContent)
  if (entries.length === 0) {
    return ''
  }

  const loaded: string[] = []
  for (const entry of entries) {
    const filePath = join(cwd, '.cc-local', 'memory', entry.file)
    try {
      const content = await readFile(filePath, 'utf8')
      loaded.push(`## Memory: ${entry.title}\n\n${content.trim()}`)
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error
      }
    }
  }

  return loaded.join('\n\n')
}

function parseMemoryIndex(index: string): MemoryEntry[] {
  const entries: MemoryEntry[] = []
  const lineRegex = /^-\s+\[([^\]]+)\]\(([^)]+)\)\s+—\s+(.+)$/gm
  for (const match of index.matchAll(lineRegex)) {
    entries.push({
      title: match[1].trim(),
      file: match[2].trim(),
      summary: match[3].trim()
    })
  }
  return entries
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx vitest run tests/memory-load.test.ts
```
预期：PASS

- [ ] **步骤 5：运行全部测试确认无回归**

```bash
npx vitest run
```
预期：全部通过

- [ ] **步骤 6：Commit**

```bash
git add src/memory.ts tests/memory-load.test.ts
git commit -m "feat: add loadMemories to parse MEMORY.md and load memory files"
```

---

### 任务 3：Memory — loadRecentSummaries — 加载最近 N 次会话摘要

**文件：**
- 修改：`tests/memory-load.test.ts`
- 修改：`src/memory.ts`

- [ ] **步骤 1：在已有测试文件中添加会话摘要测试**

```typescript
import { loadRecentSummaries } from '../src/memory.js'

describe('loadRecentSummaries', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('returns empty string when sessions dir does not exist', async () => {
    const root = await createTempDir()

    await expect(loadRecentSummaries(root, 3)).resolves.toBe('')
  })

  it('returns empty string when no session files exist', async () => {
    const root = await createTempDir()
    await mkdir(join(root, '.cc-local', 'memory', 'sessions'), { recursive: true })

    await expect(loadRecentSummaries(root, 3)).resolves.toBe('')
  })

  it('loads the most recent N session summaries', async () => {
    const root = await createTempDir()
    const sessionsDir = join(root, '.cc-local', 'memory', 'sessions')
    await mkdir(sessionsDir, { recursive: true })
    await writeFile(join(sessionsDir, '2026-05-10.md'), 'Session 10')
    await writeFile(join(sessionsDir, '2026-05-11.md'), 'Session 11')
    await writeFile(join(sessionsDir, '2026-05-12.md'), 'Session 12')
    await writeFile(join(sessionsDir, '2026-05-13.md'), 'Session 13')

    const result = await loadRecentSummaries(root, 2)
    expect(result).toContain('Session 13')
    expect(result).toContain('Session 12')
    expect(result).not.toContain('Session 11')
    expect(result).not.toContain('Session 10')
  })

  it('loads all summaries when fewer than N exist', async () => {
    const root = await createTempDir()
    const sessionsDir = join(root, '.cc-local', 'memory', 'sessions')
    await mkdir(sessionsDir, { recursive: true })
    await writeFile(join(sessionsDir, '2026-05-13.md'), 'Only session')

    const result = await loadRecentSummaries(root, 3)
    expect(result).toContain('Only session')
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx vitest run tests/memory-load.test.ts --reporter=verbose
```
预期：`loadRecentSummaries` 相关测试 FAIL

- [ ] **步骤 3：实现 `loadRecentSummaries`**

在 `src/memory.ts` 中添加：

```typescript
export async function loadRecentSummaries(cwd: string, count: number): Promise<string> {
  const sessionsDir = join(cwd, '.cc-local', 'memory', 'sessions')
  let files: string[]
  try {
    files = await readdir(sessionsDir)
  } catch (error) {
    if (isMissingFileError(error)) {
      return ''
    }
    throw error
  }

  const mdFiles = files
    .filter((f) => f.endsWith('.md'))
    .sort()
    .slice(-count)

  if (mdFiles.length === 0) {
    return ''
  }

  const contents: string[] = []
  for (const file of mdFiles) {
    const content = await readFile(join(sessionsDir, file), 'utf8')
    contents.push(`## Previous Session: ${file.replace('.md', '')}\n\n${content.trim()}`)
  }

  return contents.join('\n\n')
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx vitest run tests/memory-load.test.ts
```
预期：PASS

- [ ] **步骤 5：运行全部测试确认无回归**

```bash
npx vitest run
```

- [ ] **步骤 6：Commit**

```bash
git add src/memory.ts tests/memory-load.test.ts
git commit -m "feat: add loadRecentSummaries to load session history"
```

---

### 任务 4：Memory — saveSessionSummary + updateMemoryIndex — 写入会话摘要和更新索引

**文件：**
- 修改：`tests/memory-load.test.ts`
- 修改：`src/memory.ts`

- [ ] **步骤 1：添加写入测试**

```typescript
import { saveSessionSummary, updateMemoryIndex } from '../src/memory.js'
import { readFile } from 'node:fs/promises'

describe('saveSessionSummary', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('writes session summary to a date-named file, creating directories as needed', async () => {
    const root = await createTempDir()
    const content = '## Intent\nDid stuff\n'

    await saveSessionSummary(root, content)

    const sessionsDir = join(root, '.cc-local', 'memory', 'sessions')
    const files = await import('node:fs/promises').then((m) => m.readdir(sessionsDir))
    expect(files.length).toBe(1)
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}\.md$/)

    const saved = await readFile(join(sessionsDir, files[0]), 'utf8')
    expect(saved).toBe(content)
  })
})

describe('updateMemoryIndex', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('creates MEMORY.md with the entry when it does not exist', async () => {
    const root = await createTempDir()
    const memoryDir = join(root, '.cc-local', 'memory')
    // Don't create the directory — updateMemoryIndex should create it

    await updateMemoryIndex(root, {
      title: 'Test Memory',
      file: 'test.md',
      summary: 'a test entry'
    })

    const indexContent = await readFile(join(memoryDir, 'MEMORY.md'), 'utf8')
    expect(indexContent).toContain('[Test Memory](test.md) — a test entry')
  })

  it('appends to existing MEMORY.md', async () => {
    const root = await createTempDir()
    const memoryDir = join(root, '.cc-local', 'memory')
    await mkdir(memoryDir, { recursive: true })
    await writeFile(
      join(memoryDir, 'MEMORY.md'),
      '- [Existing](existing.md) — first entry\n'
    )

    await updateMemoryIndex(root, {
      title: 'New One',
      file: 'new.md',
      summary: 'second entry'
    })

    const indexContent = await readFile(join(memoryDir, 'MEMORY.md'), 'utf8')
    expect(indexContent).toContain('[Existing](existing.md) — first entry')
    expect(indexContent).toContain('[New One](new.md) — second entry')
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx vitest run tests/memory-load.test.ts --reporter=verbose
```
预期：`saveSessionSummary` / `updateMemoryIndex` 相关测试 FAIL

- [ ] **步骤 3：实现 `saveSessionSummary` 和 `updateMemoryIndex`**

在 `src/memory.ts` 中添加：

```typescript
import { mkdir, writeFile as fsWriteFile } from 'node:fs/promises'

export async function saveSessionSummary(cwd: string, content: string): Promise<void> {
  const sessionsDir = join(cwd, '.cc-local', 'memory', 'sessions')
  await mkdir(sessionsDir, { recursive: true })
  const date = new Date().toISOString().slice(0, 10)
  const filePath = join(sessionsDir, `${date}.md`)
  await fsWriteFile(filePath, content, 'utf8')
}

export async function updateMemoryIndex(
  cwd: string,
  entry: { title: string; file: string; summary: string }
): Promise<void> {
  const memoryDir = join(cwd, '.cc-local', 'memory')
  await mkdir(memoryDir, { recursive: true })
  const indexPath = join(memoryDir, 'MEMORY.md')
  const line = `- [${entry.title}](${entry.file}) — ${entry.summary}\n`
  try {
    await fsWriteFile(indexPath, line, { flag: 'a', encoding: 'utf8' })
  } catch (error) {
    if (isMissingFileError(error)) {
      await fsWriteFile(indexPath, line, 'utf8')
      return
    }
    throw error
  }
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx vitest run tests/memory-load.test.ts
```
预期：PASS

- [ ] **步骤 5：运行全部测试确认无回归**

```bash
npx vitest run
```

- [ ] **步骤 6：Commit**

```bash
git add src/memory.ts tests/memory-load.test.ts
git commit -m "feat: add saveSessionSummary and updateMemoryIndex"
```

---

### 任务 5：Context — compactHistory — 超阈值时压缩对话历史

**文件：**
- 创建：`tests/compact-history.test.ts`
- 修改：`src/context.ts`

- [ ] **步骤 1：编写失败的测试**

```typescript
import { describe, expect, it, vi } from 'vitest'
import { compactHistory } from '../src/context.js'
import type { ChatMessage } from '../src/llm-client.js'

function msg(role: string, content: string, extra?: Partial<ChatMessage>): ChatMessage {
  return { role, content, ...extra } as ChatMessage
}

describe('compactHistory', () => {
  it('returns messages unchanged when under token threshold', async () => {
    const messages: ChatMessage[] = [
      msg('system', 'system prompt'),
      msg('user', 'short question'),
      msg('assistant', 'short answer')
    ]
    const summarize = vi.fn()

    const result = await compactHistory(messages, {
      thresholdTokens: 100_000,
      keepRecentRounds: 8,
      summarize
    })

    expect(result).toBe(messages)
    expect(summarize).not.toHaveBeenCalled()
  })

  it('compacts messages when over token threshold', async () => {
    // Build messages where each "round" is user → assistant
    const messages: ChatMessage[] = [msg('system', 'system prompt')]
    // Create 15 rounds with large content to exceed threshold
    for (let i = 1; i <= 15; i++) {
      messages.push(msg('user', `question ${i}` + 'x'.repeat(5000)))
      messages.push(msg('assistant', `answer ${i}` + 'y'.repeat(5000)))
    }

    const summarize = vi.fn(async (text: string): Promise<string> => {
      return 'summarized content'
    })

    const result = await compactHistory(messages, {
      thresholdTokens: 10_000,
      keepRecentRounds: 5,
      summarize
    })

    // Should have been called with old messages text
    expect(summarize).toHaveBeenCalledTimes(1)

    // Result should start with system prompt, then summary, then recent rounds
    expect(result[0]).toEqual(msg('system', 'system prompt'))
    expect(result[1].role).toBe('user')
    expect(result[1].content).toContain('summarized content')
    // Recent 5 rounds = 10 messages (user + assistant each) + system + summary
    // So we should have system + summary message + 10 recent messages = 12 total
    expect(result.length).toBeLessThan(messages.length)
  })

  it('preserves system message as first message after compaction', async () => {
    const messages: ChatMessage[] = [
      msg('system', 'rules'),
      msg('user', 'q1' + 'x'.repeat(5000)),
      msg('assistant', 'a1' + 'y'.repeat(5000)),
      msg('user', 'q2' + 'x'.repeat(5000)),
      msg('assistant', 'a2' + 'y'.repeat(5000)),
      msg('user', 'q3')
    ]
    const summarize = vi.fn(async () => 'summary')

    const result = await compactHistory(messages, {
      thresholdTokens: 1000,
      keepRecentRounds: 1,
      summarize
    })

    expect(result[0]).toEqual(msg('system', 'rules'))
    expect(result[1].role).toBe('user')
    expect(result[1].content).toContain('summary')
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx vitest run tests/compact-history.test.ts
```
预期：FAIL，`compactHistory is not a function`

- [ ] **步骤 3：实现 `compactHistory`**

在 `src/context.ts` 中添加：

```typescript
import { estimateTokensForMessages } from './token-counter.js'

export async function compactHistory(
  messages: ChatMessage[],
  opts: {
    thresholdTokens: number
    keepRecentRounds: number
    summarize: (conversationText: string) => Promise<string>
  }
): Promise<ChatMessage[]> {
  const estimated = estimateTokensForMessages(messages)
  if (estimated < opts.thresholdTokens) {
    return messages
  }

  const { oldMessages, recentMessages } = splitAtUserRound(messages, opts.keepRecentRounds)
  if (oldMessages.length === 0) {
    return messages
  }

  const conversationText = oldMessages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join('\n\n')

  const summary = await opts.summarize(conversationText)
  const summaryMessage: ChatMessage = {
    role: 'user',
    content: `[Context from earlier in this conversation — the following is a summary generated when the token limit was reached. Use this as context for continuing the task.]\n\n${summary}`
  }

  // Preserve system message at the front
  const systemMessage = messages[0]?.role === 'system' ? [messages[0]] : []
  return [...systemMessage, summaryMessage, ...recentMessages]
}

function splitAtUserRound(
  messages: ChatMessage[],
  keepRecent: number
): { oldMessages: ChatMessage[]; recentMessages: ChatMessage[] } {
  // Start counting user rounds after the system message
  const startIndex = messages[0]?.role === 'system' ? 1 : 0
  let userCount = 0
  let cutIndex = messages.length

  for (let i = messages.length - 1; i >= startIndex; i--) {
    if (messages[i].role === 'user') {
      userCount++
      if (userCount === keepRecent) {
        cutIndex = i
        break
      }
    }
  }

  return {
    oldMessages: messages.slice(startIndex, cutIndex),
    recentMessages: messages.slice(cutIndex)
  }
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx vitest run tests/compact-history.test.ts
```
预期：PASS

- [ ] **步骤 5：运行全部测试确认无回归**

```bash
npx vitest run
```

- [ ] **步骤 6：Commit**

```bash
git add src/context.ts tests/compact-history.test.ts
git commit -m "feat: add compactHistory for token-threshold compression"
```

---

### 任务 6：Agent Loop — Token 检查 + Auto-Compact 触发

**文件：**
- 修改：`src/agent-loop.ts`
- 修改：`tests/agent-loop.test.ts`

已有关键信息：
- 当前 `runAgentLoop` 在 `while` 循环顶部调 `callModel`
- 需要在此调用前插入 token 检查
- `compactHistory` 需要 `summarize` 回调（调 LLM 生成摘要）
- 压缩所用的 LLM 调用不带工具定义，temperature=0

- [ ] **步骤 1：在 agent-loop.test.ts 中添加 compact 触发测试**

先读取现有测试了解结构，然后添加：

```typescript
it('compacts history when token count exceeds threshold', async () => {
  const config = createDefaultConfig('/tmp/project')
  // Set a very low threshold so any conversation triggers compaction
  config.autoCompactThreshold = 0.00001
  config.contextWindowTokens = 1000

  // Build a conversation that exceeds the tiny threshold
  const messages: ChatMessage[] = [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'first question' + 'x'.repeat(2000) },
    { role: 'assistant', content: 'first answer' + 'y'.repeat(2000) },
    { role: 'user', content: 'second question' }
  ]

  let compactCalled = false
  let regularCalled = false

  const callModel = vi.fn(async (input: { config: AppConfig; messages: ChatMessage[]; tools: unknown[] }) => {
    // The first call should be the compact call (no tools)
    if (!compactCalled && (input.tools as unknown[]).length === 0) {
      compactCalled = true
      return { content: 'compacted summary', toolCalls: [] }
    }
    regularCalled = true
    return { content: 'final answer', toolCalls: [] }
  })

  await runAgentLoop({ config, messages, tools: [], callModel })

  expect(compactCalled).toBe(true)
  expect(regularCalled).toBe(true)
})

it('does not compact when token count is below threshold', async () => {
  const config = createDefaultConfig('/tmp/project')
  config.autoCompactThreshold = 0.7
  config.contextWindowTokens = 1_000_000

  const messages: ChatMessage[] = [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'short question' }
  ]

  const callModel = vi.fn(async (): Promise<ModelResponse> => ({
    content: 'answer',
    toolCalls: []
  }))

  await runAgentLoop({ config, messages, tools: [], callModel })

  // Should have been called exactly once (for the regular LLM call, no compact call)
  const nonCompactCalls = callModel.mock.calls.filter(
    (call) => (call[0].tools as unknown[]).length > 0
  )
  expect(nonCompactCalls.length).toBe(1)
})
```

- [ ] **步骤 2：运行测试验证失败**

```bash
npx vitest run tests/agent-loop.test.ts --reporter=verbose
```
预期：新增测试 FAIL，因为还未实现 compact 逻辑

- [ ] **步骤 3：在 `runAgentLoop` 的 LLM 调用前插入 compact 检查**

在 `src/agent-loop.ts` 中，`while` 循环内、`callModel` 调用前插入：

```typescript
import { compactHistory } from './context.js'
import { estimateTokensForMessages } from './token-counter.js'

// ... 在 while 循环内，callModel 调用前添加：

const tokenThreshold = input.config.contextWindowTokens * input.config.autoCompactThreshold
const estimated = estimateTokensForMessages(messages)
if (estimated >= tokenThreshold) {
  messages.splice(
    0,
    messages.length,
    ...(await compactHistory(messages, {
      thresholdTokens: tokenThreshold,
      keepRecentRounds: 8,
      summarize: async (text: string) => {
        const response = await callModel({
          config: input.config,
          messages: [{ role: 'user', content: buildSummarizationPrompt(text) }],
          tools: []
        })
        return response.content
      }
    }))
  )
}
```

需要添加的辅助函数（放在 agent-loop.ts 文件底部）：

```typescript
function buildSummarizationPrompt(conversationText: string): string {
  return `Summarize the following conversation into a structured format. Use exactly these sections:

## Intent
[One sentence describing the user's overall goal]

## Decisions Made
- [Each key decision with brief reason]

## Files Modified
- [Each file and what changed]

## Test Results
[What tests passed/failed, or "no tests run"]

## Pending
- [Tasks not yet completed, or "nothing pending"]

Conversation:
${conversationText}`
}
```

- [ ] **步骤 4：运行测试验证通过**

```bash
npx vitest run tests/agent-loop.test.ts
```
预期：PASS

- [ ] **步骤 5：运行全部测试确认无回归**

```bash
npx vitest run
```

- [ ] **步骤 6：Commit**

```bash
git add src/agent-loop.ts tests/agent-loop.test.ts
git commit -m "feat: add auto-compact trigger when token count exceeds threshold"
```

---

### 任务 7：REPL — 会话退出时生成并保存摘要

**文件：**
- 修改：`src/repl.ts`
- 修改：`tests/repl.test.ts`

- [ ] **步骤 1：`runReplTurn` 本身不改动**

摘要生成在 `runRepl` 的 while 循环结束后触发，不在 `runReplTurn` 层级。`runReplTurn` 的单元测试无需额外测试用例（现有的 exit 测试保持通过即可）。

- [ ] **步骤 2：运行现有 repl 测试确认无回归**

```bash
npx vitest run tests/repl.test.ts
```
预期：PASS（现有测试全部通过）

- [ ] **步骤 3：在 `runRepl` 的 while 循环结束后添加摘要生成逻辑**

修改 `src/repl.ts`。需要在 `isExitInput` 返回 true 时，先生成摘要再退出。`runReplTurn` 本身不负责摘要（它是单轮函数），摘要逻辑放在 `runRepl` 的循环外层。

修改 `runRepl` 函数，在 while 循环结束后（exit 触发的 break 后）添加：

```typescript
import { callModel as defaultCallModel } from './llm-client.js'
import { saveSessionSummary } from './memory.js'

// ... 在 runRepl 函数中，while 循环 break 后：

// Generate session summary before exiting
try {
  const summaryPrompt = buildSessionSummaryPrompt(messages)
  if (summaryPrompt) {
    const summaryResponse = await defaultCallModel({
      config: inputConfig.config,
      messages: [{ role: 'user', content: summaryPrompt }],
      tools: []
    })
    if (summaryResponse.content.trim().length > 0) {
      await saveSessionSummary(inputConfig.config.cwd, summaryResponse.content.trim())
    }
  }
} catch {
  // Summary failure should not prevent exit
}
```

添加辅助函数（放在 repl.ts 底部）：

```typescript
function buildSessionSummaryPrompt(messages: ChatMessage[]): string | null {
  const conversationMessages = messages.filter((m) => m.role !== 'system')
  if (conversationMessages.length === 0) {
    return null
  }

  const text = conversationMessages
    .map((m) => `[${m.role}]: ${m.content}`)
    .join('\n\n')

  return `Summarize the following conversation into a structured format. Use exactly these sections:

## Intent
[One sentence describing the user's overall goal]

## Decisions Made
- [Each key decision with brief reason]

## Files Modified
- [Each file and what changed]

## Test Results
[What tests passed/failed, or "no tests run"]

## Pending
- [Tasks not yet completed, or "nothing pending"]

Conversation:
${text}`
}
```

- [ ] **步骤 4：运行全部测试确认无回归**

```bash
npx vitest run
```

- [ ] **步骤 5：Commit**

```bash
git add src/repl.ts
git commit -m "feat: generate and save session summary on REPL exit"
```

> 会话摘要的端到端测试（包括退出时生成摘要）在 Task 9 集成测试中覆盖。

---

### 任务 8：Main — 启动时加载记忆并注入 System Prompt

**文件：**
- 修改：`src/main.ts`

- [ ] **步骤 1：在 `main()` 中加载记忆和会话摘要，拼入 systemPrompt**

```typescript
import { loadInstructionsIfExists, loadMemories, loadRecentSummaries } from './memory.js'

// ... 在 main() 中，现有 projectInstructions 加载之后：

const projectInstructions = await loadInstructionsIfExists(config.cwd)
const memories = await loadMemories(config.cwd)
const recentSummaries = await loadRecentSummaries(config.cwd, 3)

const systemPrompt = [
  baseSystemPrompt.trimEnd(),
  projectInstructions,
  memories,
  recentSummaries
].filter(Boolean).join('\n\n')
```

- [ ] **步骤 2：运行全部测试确认无回归**

```bash
npx vitest run
npx tsc --noEmit
```

- [ ] **步骤 3：手动验证启动日志**

可选：运行 `npm run dev -- --repl` 检查启动无报错。

- [ ] **步骤 4：Commit**

```bash
git add src/main.ts
git commit -m "feat: load memories and session summaries at startup"
```

---

### 任务 9：集成测试 — 端到端验证记忆系统和 Auto-Compact

**文件：**
- 创建：`tests/memory-integration.test.ts`

- [ ] **步骤 1：编写记忆系统端到端测试（不依赖模型）**

```typescript
import { mkdir, mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  loadInstructionsIfExists,
  loadMemories,
  loadRecentSummaries,
  saveSessionSummary,
  updateMemoryIndex
} from '../src/memory.js'

const tempDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cc-local-memory-int-'))
  tempDirs.push(dir)
  return dir
}

describe('memory system end-to-end', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('full memory lifecycle: write → index → load', async () => {
    const root = await createTempDir()

    // Create a memory file
    const memoryDir = join(root, '.cc-local', 'memory')
    await mkdir(memoryDir, { recursive: true })
    await writeFile(join(memoryDir, 'style.md'), 'Use single quotes\n')

    // Index it
    await updateMemoryIndex(root, {
      title: 'Code Style',
      file: 'style.md',
      summary: 'use single quotes'
    })

    // Load memories
    const memories = await loadMemories(root)
    expect(memories).toContain('Code Style')
    expect(memories).toContain('Use single quotes')
  })

  it('full session summary lifecycle: save → load → system prompt', async () => {
    const root = await createTempDir()

    // Save a session summary
    await saveSessionSummary(root, '## Intent\nFixed a bug\n\n## Decisions Made\n- Option A\n\n## Files Modified\n- file.ts\n\n## Test Results\nPassed\n\n## Pending\n- None')

    // Save another
    await saveSessionSummary(root, '## Intent\nAdded feature\n\n## Decisions Made\n- Option B\n\n## Files Modified\n- feature.ts\n\n## Test Results\nPassed\n\n## Pending\n- Docs')

    // Load recent summaries
    const summaries = await loadRecentSummaries(root, 2)
    expect(summaries).toContain('Fixed a bug')
    expect(summaries).toContain('Added feature')

    // Verify files exist
    const sessionsDir = join(root, '.cc-local', 'memory', 'sessions')
    const files = await readdir(sessionsDir)
    expect(files.length).toBe(2)
  })

  it('memory system degrades gracefully with no .cc-local directory', async () => {
    const root = await createTempDir()

    const memories = await loadMemories(root)
    expect(memories).toBe('')

    const summaries = await loadRecentSummaries(root, 3)
    expect(summaries).toBe('')

    const instructions = await loadInstructionsIfExists(root)
    expect(instructions).toBe('')
  })
})
```

- [ ] **步骤 2：运行集成测试**

```bash
npx vitest run tests/memory-integration.test.ts
```
预期：PASS

- [ ] **步骤 3：运行全部测试确认无回归**

```bash
npx vitest run
npx tsc --noEmit
```

- [ ] **步骤 4：Commit**

```bash
git add tests/memory-integration.test.ts
git commit -m "test: add memory system integration tests"
```

---

### 任务 10：最终验证

- [ ] **步骤 1：运行全部测试**

```bash
npx vitest run
```

- [ ] **步骤 2：运行类型检查**

```bash
npx tsc --noEmit
```

- [ ] **步骤 3：检查 git status 确认所有变更已提交**

```bash
git status
```

---

## 变更总结

| 文件 | 变更类型 | 内容 |
|------|---------|------|
| `src/config.ts` | 修改 | +`contextWindowTokens`, +`autoCompactThreshold` |
| `src/memory.ts` | 修改 | +`loadMemories`, +`loadRecentSummaries`, +`saveSessionSummary`, +`updateMemoryIndex` |
| `src/context.ts` | 修改 | +`compactHistory`, +`splitAtUserRound` |
| `src/agent-loop.ts` | 修改 | +token 检查 + compact 触发 + `buildSummarizationPrompt` |
| `src/repl.ts` | 修改 | +退出时生成会话摘要 |
| `src/main.ts` | 修改 | +启动时加载记忆和摘要 |
| `tests/memory-load.test.ts` | 创建 | `loadMemories`, `loadRecentSummaries`, `saveSessionSummary`, `updateMemoryIndex` 单元测试 |
| `tests/compact-history.test.ts` | 创建 | `compactHistory` 单元测试 |
| `tests/memory-integration.test.ts` | 创建 | 记忆系统端到端集成测试 |
| `tests/agent-loop.test.ts` | 修改 | +compact 触发的测试用例 |
| `tests/repl.test.ts` | 修改 | +exit 时生成摘要的测试用例 |
