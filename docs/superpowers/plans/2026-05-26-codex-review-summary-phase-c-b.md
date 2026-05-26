# Codex Review Summary Phase C-B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Codex Stop hook 每轮生成并持久化 redacted review summary，用 cheap model 判断是否产生 pending memory，并验证 pending 能通过 Codex review tools 进入 active memory。

**Architecture:** 保留 `codex-hook-stop` 作为薄入口；新增独立的 transcript、redaction、review-summary store/runtime 模块。Hook stdout 始终输出 Codex hook control JSON，内部结果写入 `review-summaries.jsonl` 和 pending memory。

**Tech Stack:** TypeScript, Vitest, MCP SDK, existing `callModel`, existing Codex memory root and pending review runtime.

---

## 当前基线

当前分支已经包含两个基础提交：

- `40d3945 docs: add Codex review summary phase C-B spec`
- `a684d42 fix: return valid Codex stop hook output`

`a684d42` 已修复当前 hook 报错：`codex hook stop` 的 stdout 是 `{"continue":true,"suppressOutput":true}`，不是内部 `action` JSON。后续任务不能破坏这个行为。

## 文件结构

- Create: `src/codex/transcript.ts`
  - 负责 Codex transcript JSONL 解析和 recent message window。
- Modify: `src/codex/codex-hook-stop.ts`
  - 只保留 Stop hook orchestration、显式 durable instruction fallback、Codex hook stdout formatting。
- Create: `src/codex/review-redaction.ts`
  - 负责 deterministic redaction 和 redaction counts。
- Create: `src/codex/review-summary-store.ts`
  - 负责 `review-summaries.jsonl` 的 append/read 测试辅助。
- Create: `src/codex/review-summary-runtime.ts`
  - 负责 build prompt、call cheap model、parse JSON、二次 redaction、写 summary、写 pending。
- Modify: `src/codex/codex-hook-install.ts`
  - 将 Cyrene Stop hook timeout 调整为 30 秒，并更新已存在的 Cyrene hook timeout。
- Modify: `tests/codex-hook-stop.test.ts`
  - 覆盖 hook 集成、stdout contract、显式 durable fallback。
- Create: `tests/codex-transcript.test.ts`
  - 覆盖 transcript parsing/window。
- Create: `tests/codex-review-redaction.test.ts`
  - 覆盖 secret/email/token/private key redaction。
- Create: `tests/codex-review-summary-store.test.ts`
  - 覆盖 summary JSONL append/read。
- Create: `tests/codex-review-summary-runtime.test.ts`
  - 覆盖 no-candidate、candidate、LLM failure、output redaction。
- Modify: `tests/codex-hook-install.test.ts`
  - 覆盖 timeout 30 秒和已有 hook timeout 更新。
- Modify: `tests/mcp-server.test.ts`
  - 增加 fresh MCP `listTools()` smoke test，验证 pending review tools 可见。

## Task 1: 抽出 transcript parser

**Files:**
- Create: `src/codex/transcript.ts`
- Modify: `src/codex/codex-hook-stop.ts`
- Create: `tests/codex-transcript.test.ts`
- Modify: `tests/codex-hook-stop.test.ts`

- [ ] **Step 1: 写 failing tests**

Create `tests/codex-transcript.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseTranscriptMessages, recentTranscriptMessages } from '../src/codex/transcript.js'

describe('Codex transcript parsing', () => {
  it('parses string and array text content from JSONL transcript lines', () => {
    const messages = parseTranscriptMessages(
      [
        JSON.stringify({ role: 'user', content: 'hello' }),
        JSON.stringify({ message: { role: 'assistant', content: [{ text: 'world' }] } }),
        'not json'
      ].join('\n')
    )

    expect(messages).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' }
    ])
  })

  it('keeps only the most recent messages after parsing', () => {
    const messages = Array.from({ length: 45 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message-${index}`
    }))

    expect(recentTranscriptMessages(messages, 40)).toHaveLength(40)
    expect(recentTranscriptMessages(messages, 40)[0]?.content).toBe('message-5')
    expect(recentTranscriptMessages(messages, 40)[39]?.content).toBe('message-44')
  })
})
```

- [ ] **Step 2: 运行 RED**

Run:

```sh
npm test -- tests/codex-transcript.test.ts
```

Expected: FAIL，因为 `src/codex/transcript.ts` 不存在。

- [ ] **Step 3: 实现 transcript helper**

Create `src/codex/transcript.ts`:

```ts
export interface TranscriptMessage {
  role: string
  content: string
}

export function parseTranscriptMessages(text: string): TranscriptMessage[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return parseTranscriptLine(JSON.parse(line) as unknown)
      } catch {
        return []
      }
    })
}

export function recentTranscriptMessages(messages: TranscriptMessage[], limit = 40): TranscriptMessage[] {
  return messages.slice(Math.max(0, messages.length - limit))
}

function parseTranscriptLine(value: unknown): TranscriptMessage[] {
  const record = isRecord(value) ? value : undefined
  const source = isRecord(record?.message) ? record.message : record
  const role = asString(source?.role)
  const content = contentToString(source?.content)
  if (role === undefined || content === undefined) {
    return []
  }
  return [{ role, content }]
}

function contentToString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }
  if (!Array.isArray(value)) {
    return undefined
  }
  const parts = value.flatMap((entry) => {
    if (typeof entry === 'string') {
      return [entry]
    }
    if (isRecord(entry) && typeof entry.text === 'string') {
      return [entry.text]
    }
    return []
  })
  return parts.length > 0 ? parts.join('\n') : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
```

- [ ] **Step 4: 更新 hook 使用新 helper**

Modify `src/codex/codex-hook-stop.ts`:

```ts
import { parseTranscriptMessages } from './transcript.js'
```

删除文件内原来的 `TranscriptMessage` interface、`parseTranscriptMessages`、`parseTranscriptLine`、`contentToString`、重复的 `isRecord` helper。保留 `asString`，因为 payload parsing 仍使用它。

- [ ] **Step 5: 运行 GREEN**

Run:

```sh
npm test -- tests/codex-transcript.test.ts tests/codex-hook-stop.test.ts
```

Expected: PASS。

- [ ] **Step 6: Commit**

```sh
git add src/codex/transcript.ts src/codex/codex-hook-stop.ts tests/codex-transcript.test.ts tests/codex-hook-stop.test.ts
git commit -m "refactor: share Codex transcript parsing"
```

## Task 2: 增加 deterministic redaction

**Files:**
- Create: `src/codex/review-redaction.ts`
- Create: `tests/codex-review-redaction.test.ts`

- [ ] **Step 1: 写 failing tests**

Create `tests/codex-review-redaction.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { redactReviewText } from '../src/codex/review-redaction.js'

describe('Codex review redaction', () => {
  it('redacts common secrets and personal identifiers with counts', () => {
    const input = [
      'OPENAI_API_KEY=sk-abc1234567890abcdef1234567890',
      'Authorization: Bearer verylongbearertoken1234567890',
      'email me at user@example.com',
      'call +1 415 555 1212',
      'random token 0123456789abcdef0123456789abcdef',
      '-----BEGIN PRIVATE KEY-----',
      'secret',
      '-----END PRIVATE KEY-----'
    ].join('\n')

    const result = redactReviewText(input)

    expect(result.text).not.toContain('sk-abc')
    expect(result.text).not.toContain('verylongbearer')
    expect(result.text).not.toContain('user@example.com')
    expect(result.text).not.toContain('415 555 1212')
    expect(result.text).not.toContain('0123456789abcdef0123456789abcdef')
    expect(result.text).not.toContain('BEGIN PRIVATE KEY')
    expect(result.text).toContain('[REDACTED_SECRET]')
    expect(result.text).toContain('[REDACTED_EMAIL]')
    expect(result.counts.secret).toBeGreaterThanOrEqual(2)
    expect(result.counts.email).toBe(1)
    expect(result.counts.phone).toBe(1)
    expect(result.counts.privateKey).toBe(1)
  })

  it('merges redaction counts', () => {
    expect(redactReviewText('a@example.com b@example.com').counts.email).toBe(2)
  })
})
```

- [ ] **Step 2: 运行 RED**

Run:

```sh
npm test -- tests/codex-review-redaction.test.ts
```

Expected: FAIL，因为模块不存在。

- [ ] **Step 3: 实现 redaction helper**

Create `src/codex/review-redaction.ts`:

```ts
export interface RedactionResult {
  text: string
  counts: Record<string, number>
}

type RedactionRule = {
  name: string
  pattern: RegExp
  replacement: string
}

const RULES: RedactionRule[] = [
  {
    name: 'privateKey',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]'
  },
  {
    name: 'secret',
    pattern: /\b[A-Z0-9_]*(?:API_KEY|TOKEN|PASSWORD|SECRET)\s*=\s*["']?[^"'\s]+["']?/gi,
    replacement: '[REDACTED_SECRET]'
  },
  {
    name: 'secret',
    pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g,
    replacement: '[REDACTED_SECRET]'
  },
  {
    name: 'secret',
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}\b/gi,
    replacement: 'Bearer [REDACTED_SECRET]'
  },
  {
    name: 'email',
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: '[REDACTED_EMAIL]'
  },
  {
    name: 'phone',
    pattern: /\b(?:\+?\d[\d .()_-]{7,}\d)\b/g,
    replacement: '[REDACTED_PHONE]'
  },
  {
    name: 'secret',
    pattern: /\b[A-Fa-f0-9]{32,}\b/g,
    replacement: '[REDACTED_SECRET]'
  }
]

export function redactReviewText(input: string): RedactionResult {
  const counts: Record<string, number> = {}
  let text = input

  for (const rule of RULES) {
    text = text.replace(rule.pattern, (...args: unknown[]) => {
      counts[rule.name] = (counts[rule.name] ?? 0) + 1
      return rule.replacement
    })
  }

  return { text, counts }
}

export function mergeRedactionCounts(left: Record<string, number>, right: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = { ...left }
  for (const [key, value] of Object.entries(right)) {
    result[key] = (result[key] ?? 0) + value
  }
  return result
}
```

- [ ] **Step 4: 运行 GREEN**

Run:

```sh
npm test -- tests/codex-review-redaction.test.ts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```sh
git add src/codex/review-redaction.ts tests/codex-review-redaction.test.ts
git commit -m "feat: add Codex review redaction"
```

## Task 3: 增加 review summary store

**Files:**
- Create: `src/codex/review-summary-store.ts`
- Create: `tests/codex-review-summary-store.test.ts`

- [ ] **Step 1: 写 failing tests**

Create `tests/codex-review-summary-store.test.ts`:

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appendCodexReviewSummary } from '../src/codex/review-summary-store.js'

const originalHome = process.env.HOME
const tempDirs: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  process.env.HOME = originalHome
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

describe('Codex review summary store', () => {
  it('appends review summaries as JSONL under the Codex memory root', async () => {
    const home = await createTempDir('cyrene-review-summary-home-')
    vi.stubEnv('HOME', home)
    const memoryRoot = await createTempDir('cyrene-review-summary-root-')

    await appendCodexReviewSummary(memoryRoot, {
      id: 'summary-1',
      runId: 'session:turn',
      createdAt: '2026-05-26T00:00:00.000Z',
      status: 'ok',
      summary: '用户确认 C-B 使用 cheap model。',
      redaction: { input: {}, output: {} },
      model: { useCase: 'memory_extraction', model: 'cheap-model' },
      candidateIds: []
    })

    const raw = await readFile(join(memoryRoot, 'review-summaries.jsonl'), 'utf8')
    expect(raw).toContain('"id":"summary-1"')
    expect(raw).toContain('"candidateIds":[]')
  })
})
```

- [ ] **Step 2: 运行 RED**

Run:

```sh
npm test -- tests/codex-review-summary-store.test.ts
```

Expected: FAIL，因为 store 模块不存在。

- [ ] **Step 3: 实现 store**

Create `src/codex/review-summary-store.ts`:

```ts
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureWritableMemoryRootPath } from '../memory/memory-store.js'

export interface CodexReviewSummaryRecord {
  id: string
  runId: string
  sessionId?: string
  turnId?: string
  createdAt: string
  status: 'ok' | 'failed'
  summary: string
  redaction: {
    input: Record<string, number>
    output: Record<string, number>
  }
  model?: {
    useCase: 'memory_extraction'
    model?: string
  }
  candidateIds: string[]
  failureReason?: string
}

const REVIEW_SUMMARIES_FILE = 'review-summaries.jsonl'

export async function appendCodexReviewSummary(memoryRoot: string, record: CodexReviewSummaryRecord): Promise<void> {
  const root = await ensureWritableMemoryRootPath(memoryRoot)
  await appendFile(join(root, REVIEW_SUMMARIES_FILE), `${JSON.stringify(record)}\n`, 'utf8')
}
```

- [ ] **Step 4: 运行 GREEN**

Run:

```sh
npm test -- tests/codex-review-summary-store.test.ts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```sh
git add src/codex/review-summary-store.ts tests/codex-review-summary-store.test.ts
git commit -m "feat: persist Codex review summaries"
```

## Task 4: 实现 review summary runtime

**Files:**
- Create: `src/codex/review-summary-runtime.ts`
- Create: `tests/codex-review-summary-runtime.test.ts`

- [ ] **Step 1: 写 failing tests**

Create `tests/codex-review-summary-runtime.test.ts` with four cases:

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { codexProjectMemoryRoot } from '../src/codex/codex-memory-root.js'
import { runCodexReviewSummary } from '../src/codex/review-summary-runtime.js'
import { createDefaultConfig } from '../src/config.js'
import type { CallModelInput, ModelResponse } from '../src/llm-client.js'

const originalHome = process.env.HOME
const tempDirs: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  process.env.HOME = originalHome
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function modelResponse(content: string): ModelResponse {
  return { content, toolCalls: [] }
}

describe('Codex review summary runtime', () => {
  it('writes a redacted summary without pending candidates', async () => {
    const home = await createTempDir('cyrene-review-runtime-home-')
    vi.stubEnv('HOME', home)
    const cwd = await createTempDir('cyrene-review-runtime-project-')
    const config = createDefaultConfig(cwd)
    config.model.baseUrl = 'http://localhost:1'
    config.model.model = 'strong'
    config.model.cheapModel = 'cheap'

    const result = await runCodexReviewSummary({
      cwd,
      sessionId: 's1',
      turnId: 't1',
      messages: [{ role: 'user', content: '这里是普通讨论。' }],
      config,
      callModel: async (input: CallModelInput) => {
        expect(input.useCase).toBe('memory_extraction')
        return modelResponse(JSON.stringify({
          summary: '用户进行普通讨论，没有长期记忆。',
          candidates: []
        }))
      },
      now: '2026-05-26T00:00:00.000Z'
    })

    expect(result.action).toBe('summary')
    const raw = await readFile(join(result.memoryRoot, 'review-summaries.jsonl'), 'utf8')
    expect(raw).toContain('用户进行普通讨论')
    await expect(readFile(join(result.memoryRoot, 'pending.jsonl'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('writes pending candidates from review-safe model output', async () => {
    const home = await createTempDir('cyrene-review-runtime-home-')
    vi.stubEnv('HOME', home)
    const cwd = await createTempDir('cyrene-review-runtime-project-')
    const config = createDefaultConfig(cwd)
    config.model.baseUrl = 'http://localhost:1'
    config.model.model = 'strong'
    config.model.cheapModel = 'cheap'

    const result = await runCodexReviewSummary({
      cwd,
      sessionId: 's1',
      turnId: 't2',
      messages: [{ role: 'user', content: '以后默认 spec 和 plan 用中文写。' }],
      config,
      callModel: async () => modelResponse(JSON.stringify({
        summary: '用户明确要求 spec 和 plan 默认用中文写。',
        candidates: [
          {
            domain: 'procedural',
            type: 'procedural_rule',
            strength: 'hard',
            scope: 'global',
            content: '以后在所有项目里，所有 spec 和 plan 默认用中文写。',
            normalizedKey: 'procedural-procedural-rule-spec-plan-chinese',
            source: 'user_explicit',
            scores: {
              evidenceStrength: 0.9,
              stability: 0.85,
              usefulness: 0.9,
              safety: 0.95,
              sensitivity: 0.1
            },
            evidence: [{ summary: '用户明确要求 spec 和 plan 默认用中文写。' }],
            tags: ['codex-review-summary']
          }
        ]
      })),
      now: '2026-05-26T00:00:00.000Z'
    })

    expect(result.action).toBe('pending')
    expect(result.candidateIds).toHaveLength(1)
    const pending = await readFile(join(result.memoryRoot, 'pending.jsonl'), 'utf8')
    expect(pending).toContain('spec 和 plan 默认用中文写')
    const summaries = await readFile(join(result.memoryRoot, 'review-summaries.jsonl'), 'utf8')
    expect(summaries).toContain(result.candidateIds[0])
  })

  it('redacts model output before writing summaries and candidates', async () => {
    const home = await createTempDir('cyrene-review-runtime-home-')
    vi.stubEnv('HOME', home)
    const cwd = await createTempDir('cyrene-review-runtime-project-')
    const config = createDefaultConfig(cwd)
    config.model.baseUrl = 'http://localhost:1'
    config.model.model = 'strong'
    config.model.cheapModel = 'cheap'

    const result = await runCodexReviewSummary({
      cwd,
      messages: [{ role: 'user', content: 'token is sk-abc1234567890abcdef1234567890' }],
      config,
      callModel: async () => modelResponse(JSON.stringify({
        summary: '用户贴出了 sk-abc1234567890abcdef1234567890。',
        candidates: []
      })),
      now: '2026-05-26T00:00:00.000Z'
    })

    expect(result.action).toBe('summary')
    const raw = await readFile(join(result.memoryRoot, 'review-summaries.jsonl'), 'utf8')
    expect(raw).not.toContain('sk-abc')
    expect(raw).toContain('[REDACTED_SECRET]')
  })

  it('writes a failed summary record when the model fails', async () => {
    const home = await createTempDir('cyrene-review-runtime-home-')
    vi.stubEnv('HOME', home)
    const cwd = await createTempDir('cyrene-review-runtime-project-')
    const config = createDefaultConfig(cwd)
    config.model.baseUrl = 'http://localhost:1'
    config.model.model = 'strong'
    config.model.cheapModel = 'cheap'

    const result = await runCodexReviewSummary({
      cwd,
      messages: [{ role: 'user', content: '普通消息' }],
      config,
      callModel: async () => {
        throw new Error('model unavailable')
      },
      now: '2026-05-26T00:00:00.000Z'
    })

    expect(result.action).toBe('summary_failed')
    const raw = await readFile(join(result.memoryRoot, 'review-summaries.jsonl'), 'utf8')
    expect(raw).toContain('Codex review summary failed; no transcript content persisted.')
    expect(raw).toContain('model unavailable')
  })
})
```

- [ ] **Step 2: 运行 RED**

Run:

```sh
npm test -- tests/codex-review-summary-runtime.test.ts
```

Expected: FAIL，因为 runtime 模块不存在。

- [ ] **Step 3: 实现 runtime types 和 prompt**

Create `src/codex/review-summary-runtime.ts` with these exports:

```ts
import { randomUUID } from 'node:crypto'
import { ensureCodexProjectMemoryRoot } from './codex-memory-root.js'
import { proposeCodexMemoryCandidate, type CodexMemoryCandidateInput } from './memory-propose.js'
import { identifyCodexProject } from './project-id.js'
import { redactReviewText } from './review-redaction.js'
import { appendCodexReviewSummary } from './review-summary-store.js'
import { recentTranscriptMessages, type TranscriptMessage } from './transcript.js'
import type { AppConfig } from '../config.js'
import type { CallModelInput, ModelResponse } from '../llm-client.js'

export type CodexReviewSummaryResult =
  | { action: 'noop'; reason: string }
  | { action: 'summary'; summaryId: string; memoryRoot: string; candidateIds: [] }
  | { action: 'pending'; summaryId: string; memoryRoot: string; candidateIds: string[] }
  | { action: 'summary_failed'; summaryId: string; memoryRoot: string; reason: string }

export interface RunCodexReviewSummaryInput {
  cwd: string
  sessionId?: string
  turnId?: string
  messages: TranscriptMessage[]
  config: AppConfig
  callModel: (input: CallModelInput) => Promise<ModelResponse>
  now?: string
  signal?: AbortSignal
}
```

Implement `buildCodexReviewSummaryPrompt(input)` in the same file. Prompt rules must include:

```txt
Return JSON only.
Prefer no candidates over weak candidates.
Use only redacted transcript text.
Do not store secrets, credentials, raw quotes, psychological diagnoses, or assistant-only suggestions.
Candidates must match the existing memory candidate schema.
```

- [ ] **Step 4: 实现 parser 和 candidate conversion**

In `src/codex/review-summary-runtime.ts`, add:

```ts
interface ParsedReviewSummary {
  summary: string
  candidates: CodexMemoryCandidateInput[]
}

function parseReviewSummaryResponse(content: string): ParsedReviewSummary {
  const parsed = JSON.parse(extractJsonObject(content)) as unknown
  if (!isRecord(parsed)) {
    throw new Error('Review summary response must be an object')
  }
  const summary = parseString(parsed.summary, 'summary').slice(0, 1000)
  const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : []
  return {
    summary,
    candidates: rawCandidates.map(parseCandidate)
  }
}
```

Reuse the enum values from `memory-candidate-extractor.ts` by duplicating the small enum sets locally for now. Do not import private functions from that file.

- [ ] **Step 5: 实现 `runCodexReviewSummary`**

Core behavior:

```ts
export async function runCodexReviewSummary(input: RunCodexReviewSummaryInput): Promise<CodexReviewSummaryResult> {
  const messages = recentTranscriptMessages(input.messages, 40)
  if (messages.length === 0) {
    return { action: 'noop', reason: 'No transcript messages to summarize.' }
  }

  const now = input.now ?? new Date().toISOString()
  const project = await identifyCodexProject(input.cwd)
  const memoryRoot = await ensureCodexProjectMemoryRoot(project.projectId)
  const summaryId = randomUUID()
  const runId = [input.sessionId, input.turnId].filter(Boolean).join(':') || summaryId
  const redactedInput = redactReviewText(formatMessages(messages))

  try {
    const response = await input.callModel({
      config: input.config,
      messages: [{ role: 'user', content: buildCodexReviewSummaryPrompt({ runId, transcript: redactedInput.text }) }],
      tools: [],
      useCase: 'memory_extraction',
      signal: input.signal
    })
    const parsed = parseReviewSummaryResponse(response.content)
    const redactedSummary = redactReviewText(parsed.summary)
    const candidateIds: string[] = []

    for (const candidate of parsed.candidates) {
      const safeCandidate = redactCandidate(candidate, runId, redactedSummary.text)
      const proposed = await proposeCodexMemoryCandidate({ cwd: input.cwd, candidate: safeCandidate, now })
      if (proposed.result.action === 'pending') {
        candidateIds.push(proposed.result.candidateId)
      }
    }

    await appendCodexReviewSummary(memoryRoot, {
      id: summaryId,
      runId,
      sessionId: input.sessionId,
      turnId: input.turnId,
      createdAt: now,
      status: 'ok',
      summary: redactedSummary.text,
      redaction: { input: redactedInput.counts, output: redactedSummary.counts },
      model: { useCase: 'memory_extraction', model: input.config.model.cheapModel || input.config.model.strongModel },
      candidateIds
    })

    return candidateIds.length > 0
      ? { action: 'pending', summaryId, memoryRoot, candidateIds }
      : { action: 'summary', summaryId, memoryRoot, candidateIds: [] }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    await appendCodexReviewSummary(memoryRoot, {
      id: summaryId,
      runId,
      sessionId: input.sessionId,
      turnId: input.turnId,
      createdAt: now,
      status: 'failed',
      summary: 'Codex review summary failed; no transcript content persisted.',
      redaction: { input: redactedInput.counts, output: {} },
      model: { useCase: 'memory_extraction', model: input.config.model.cheapModel || input.config.model.strongModel },
      candidateIds: [],
      failureReason: reason.slice(0, 500)
    })
    return { action: 'summary_failed', summaryId, memoryRoot, reason }
  }
}
```

- [ ] **Step 6: 运行 GREEN**

Run:

```sh
npm test -- tests/codex-review-summary-runtime.test.ts tests/codex-review-redaction.test.ts tests/codex-review-summary-store.test.ts
```

Expected: PASS。

- [ ] **Step 7: Commit**

```sh
git add src/codex/review-summary-runtime.ts tests/codex-review-summary-runtime.test.ts
git commit -m "feat: add Codex review summary runtime"
```

## Task 5: 集成 Stop hook 和 explicit fallback

**Files:**
- Modify: `src/codex/codex-hook-stop.ts`
- Modify: `tests/codex-hook-stop.test.ts`

- [ ] **Step 1: 写 failing integration tests**

Add to `tests/codex-hook-stop.test.ts`:

```ts
it('keeps command output valid while internal runtime writes review summaries', async () => {
  const home = await createTempDir('cyrene-codex-stop-home-')
  vi.stubEnv('HOME', home)
  const cwd = await createTempDir('cyrene-codex-stop-project-')
  const transcript = join(cwd, 'transcript.jsonl')
  await writeFile(transcript, JSON.stringify({ role: 'user', content: '普通讨论' }) + '\n')

  const result = await handleCodexStopHookPayload(
    { cwd, transcript_path: transcript, session_id: 's1', turn_id: 't1' },
    {
      callModel: async () => ({ content: JSON.stringify({ summary: '普通讨论，无长期记忆。', candidates: [] }), toolCalls: [] })
    }
  )

  expect(result.action).toBe('summary')
  const output = formatCodexStopHookCommandOutput(result)
  expect(JSON.parse(output)).toEqual({ continue: true, suppressOutput: true })
})

it('still proposes explicit durable memory when review summary model fails', async () => {
  const home = await createTempDir('cyrene-codex-stop-home-')
  vi.stubEnv('HOME', home)
  const cwd = await createTempDir('cyrene-codex-stop-project-')
  const transcript = join(cwd, 'transcript.jsonl')
  await writeFile(transcript, JSON.stringify({ role: 'user', content: '以后默认 spec 和 plan 用中文写。' }) + '\n')

  const result = await handleCodexStopHookPayload(
    { cwd, transcript_path: transcript, session_id: 's1', turn_id: 't2' },
    {
      callModel: async () => {
        throw new Error('model unavailable')
      }
    }
  )

  expect(result.action).toBe('pending')
})
```

- [ ] **Step 2: 运行 RED**

Run:

```sh
npm test -- tests/codex-hook-stop.test.ts
```

Expected: FAIL，因为 `handleCodexStopHookPayload` 还没有 dependency injection 和 summary action。

- [ ] **Step 3: 更新 hook result type 和 deps**

Modify `src/codex/codex-hook-stop.ts`:

```ts
export type CodexStopHookResult =
  | { action: 'noop'; reason: string }
  | { action: 'summary'; summaryId: string; reason: string }
  | { action: 'pending'; candidateId?: string; candidateIds?: string[]; reason: string; summaryId?: string }
  | { action: 'reject'; reason: string; summaryId?: string }
  | { action: 'summary_failed'; reason: string; summaryId?: string }

export interface CodexStopHookDeps {
  callModel?: RunCodexReviewSummaryInput['callModel']
  config?: AppConfig
}
```

Import:

```ts
import { createDefaultConfig } from '../config.js'
import { callModel as defaultCallModel } from '../llm-client.js'
import { runCodexReviewSummary, type RunCodexReviewSummaryInput } from './review-summary-runtime.js'
import { parseTranscriptMessages } from './transcript.js'
```

- [ ] **Step 4: 更新 `handleCodexStopHookPayload` orchestration**

Behavior order:

1. Read transcript.
2. Parse messages.
3. Run `runCodexReviewSummary` when messages exist.
4. Independently detect recent explicit durable instruction and propose it if present.
5. Prefer returning `pending` when explicit or model candidates created.
6. Return `summary` or `summary_failed` otherwise.
7. Never throw for model failure.

Implementation shape:

```ts
export async function handleCodexStopHookPayload(
  payload: CodexStopHookPayload,
  deps: CodexStopHookDeps = {}
): Promise<CodexStopHookResult> {
  const cwd = asString(payload.cwd) ?? process.cwd()
  const transcriptPath = asString(payload.transcript_path) ?? asString(payload.transcriptPath)
  if (transcriptPath === undefined) {
    return { action: 'noop', reason: 'No transcript path provided.' }
  }

  const transcriptText = await readTranscriptText(transcriptPath)
  if (transcriptText === undefined) {
    return { action: 'noop', reason: 'Transcript file not found.' }
  }

  const messages = parseTranscriptMessages(transcriptText)
  if (messages.length === 0) {
    return { action: 'noop', reason: 'No transcript messages found.' }
  }

  const config = deps.config ?? createDefaultConfig(cwd)
  const review = await runCodexReviewSummary({
    cwd,
    sessionId: asString(payload.session_id),
    turnId: asString(payload.turn_id),
    messages,
    config,
    callModel: deps.callModel ?? defaultCallModel,
    signal: AbortSignal.timeout(20_000)
  })

  const explicit = await proposeExplicitMemoryInstruction({ cwd, payload, messages })
  if (explicit?.result.action === 'pending') {
    const modelCandidateIds = review.action === 'pending' ? review.candidateIds : []
    return {
      action: 'pending',
      candidateId: explicit.result.candidateId,
      candidateIds: [explicit.result.candidateId, ...modelCandidateIds],
      summaryId: 'summaryId' in review ? review.summaryId : undefined,
      reason: explicit.result.reason
    }
  }

  if (review.action === 'pending') {
    return {
      action: 'pending',
      candidateIds: review.candidateIds,
      summaryId: review.summaryId,
      reason: 'Codex review summary produced pending memory candidates.'
    }
  }

  if (review.action === 'summary') {
    return { action: 'summary', summaryId: review.summaryId, reason: 'Codex review summary written.' }
  }

  if (review.action === 'summary_failed') {
    return { action: 'summary_failed', summaryId: review.summaryId, reason: review.reason }
  }

  return review
}
```

- [ ] **Step 5: 运行 GREEN**

Run:

```sh
npm test -- tests/codex-hook-stop.test.ts tests/codex-review-summary-runtime.test.ts
printf '%s' '{}' | npm --prefix /Users/phoenix/Assistant/Cyrene run --silent dev -- codex hook stop
```

Expected:

- Tests PASS.
- Manual command prints exactly `{"continue":true,"suppressOutput":true}`.

- [ ] **Step 6: Commit**

```sh
git add src/codex/codex-hook-stop.ts tests/codex-hook-stop.test.ts
git commit -m "feat: run Codex review summaries from stop hook"
```

## Task 6: 调整 hook install timeout

**Files:**
- Modify: `src/codex/codex-hook-install.ts`
- Modify: `tests/codex-hook-install.test.ts`

- [ ] **Step 1: 写 failing tests**

Add to `tests/codex-hook-install.test.ts`:

```ts
it('installs the Cyrene Stop hook with a 30 second timeout', async () => {
  const home = await createTempDir('cyrene-codex-hook-timeout-home-')
  const hooksPath = join(home, '.codex', 'hooks.json')

  await execFileAsync(
    process.execPath,
    ['node_modules/tsx/dist/cli.mjs', 'src/main.ts', 'codex', 'install-hook', '--stop'],
    { env: cliEnv(home) }
  )

  const parsed = JSON.parse(await readFile(hooksPath, 'utf8')) as {
    hooks: { Stop: Array<{ hooks: Array<{ command: string; timeout: number }> }> }
  }
  const cyreneHook = parsed.hooks.Stop.flatMap((entry) => entry.hooks).find((hook) => hook.command.includes('codex hook stop'))
  expect(cyreneHook?.timeout).toBe(30)
})
```

Update the existing “preserves existing Stop hooks” test to seed a Cyrene hook with timeout 5 and expect timeout 30 after install.

- [ ] **Step 2: 运行 RED**

Run:

```sh
npm test -- tests/codex-hook-install.test.ts
```

Expected: FAIL，因为 timeout 仍是 5。

- [ ] **Step 3: 实现 timeout constant 和 merge update**

Modify `src/codex/codex-hook-install.ts`:

```ts
const CODEX_STOP_HOOK_TIMEOUT_SECONDS = 30
```

In `mergeStopHookConfig`, when a hook command matches `codexStopHookCommand()`, replace it with:

```ts
{ ...hook, timeout: CODEX_STOP_HOOK_TIMEOUT_SECONDS }
```

When adding a new hook, use:

```ts
hooks: [{ type: 'command', command, timeout: CODEX_STOP_HOOK_TIMEOUT_SECONDS }]
```

- [ ] **Step 4: 运行 GREEN**

Run:

```sh
npm test -- tests/codex-hook-install.test.ts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```sh
git add src/codex/codex-hook-install.ts tests/codex-hook-install.test.ts
git commit -m "fix: extend Codex stop hook timeout"
```

## Task 7: 验证 MCP review-to-active 工具可见性

**Files:**
- Modify: `tests/mcp-server.test.ts`
- Optional manual command only: no production file change unless test reveals a real bug.

- [ ] **Step 1: 写 fresh MCP listTools test**

Add to `tests/mcp-server.test.ts`:

```ts
it('exposes Codex pending review tools through a fresh MCP server', async () => {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
  const client = new Client({ name: 'cyrene-mcp-test', version: '0.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['node_modules/tsx/dist/cli.mjs', 'src/main.ts', 'mcp-server', '--stdio']
  })

  await client.connect(transport)
  try {
    const result = await client.listTools()
    const names = result.tools.map((tool) => tool.name)
    expect(names).toContain('cyrene_memory_pending_list')
    expect(names).toContain('cyrene_memory_pending_get')
    expect(names).toContain('cyrene_memory_promote')
    expect(names).toContain('cyrene_memory_reject')
  } finally {
    await client.close()
  }
})
```

- [ ] **Step 2: 运行 test**

Run:

```sh
npm test -- tests/mcp-server.test.ts
```

Expected: PASS. If it fails, inspect `src/mcp/mcp-server.ts` registration and fix only the missing registration.

- [ ] **Step 3: 手动 smoke command**

Run:

```sh
node --input-type=module <<'EOF'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const transport = new StdioClientTransport({
  command: 'npm',
  args: ['--prefix', '/Users/phoenix/Assistant/Cyrene', 'run', '--silent', 'dev', '--', 'mcp-server', '--stdio']
})
const client = new Client({ name: 'cyrene-tool-list-smoke', version: '0.0.0' })
await client.connect(transport)
const result = await client.listTools()
console.log(result.tools.map((tool) => tool.name).sort().join('\n'))
await client.close()
EOF
```

Expected output contains:

```txt
cyrene_memory_pending_get
cyrene_memory_pending_list
cyrene_memory_promote
cyrene_memory_reject
```

- [ ] **Step 4: Commit**

```sh
git add tests/mcp-server.test.ts
git commit -m "test: verify Codex memory review MCP tools"
```

## Task 8: End-to-end verification and local hook refresh

**Files:**
- No code files unless verification finds a bug.
- May update `/Users/phoenix/.codex/hooks.json` by running installer after tests pass.

- [ ] **Step 1: Run full verification**

Run:

```sh
npm run typecheck
npm test
git diff --check
```

Expected:

- `tsc --noEmit` exits 0.
- `vitest run` exits 0.
- `git diff --check` exits 0.

- [ ] **Step 2: Reinstall local Codex Stop hook**

Run:

```sh
npm --prefix /Users/phoenix/Assistant/Cyrene run --silent dev -- codex install-hook --stop
```

Expected: `/Users/phoenix/.codex/hooks.json` still preserves the sound hook and updates the Cyrene Stop hook timeout to 30.

- [ ] **Step 3: Manual hook smoke**

Run:

```sh
printf '%s' '{}' | npm --prefix /Users/phoenix/Assistant/Cyrene run --silent dev -- codex hook stop
```

Expected:

```json
{"continue":true,"suppressOutput":true}
```

- [ ] **Step 4: Manual pending-to-active smoke**

Start a fresh Codex thread after implementation. Ask:

```txt
请使用 cyrene-continuity 检查当前项目上下文。
```

Expected:

- Tool surface includes `cyrene_memory_pending_list/get/promote/reject`.
- If a pending item exists, Cyrene skill can list it.
- After explicit “批准”, Codex can call `cyrene_memory_promote`.
- The promoted item appears in `cyrene_continuity_get` active memory on the next call.

- [ ] **Step 5: Commit any verification-only doc or test adjustments**

Only run if Step 1 to Step 4 required a real file change:

```sh
git add <changed-files>
git commit -m "test: verify Codex review summary phase c-b"
```

## Self-Review

- Spec coverage:
  - 每轮 review summary: Task 4 and Task 5.
  - deterministic redaction: Task 2.
  - `review-summaries.jsonl`: Task 3.
  - cheap model route via `memory_extraction`: Task 4.
  - pending-only candidates: Task 4 uses `proposeCodexMemoryCandidate`.
  - hook stdout control JSON: existing `a684d42` plus Task 5.
  - timeout budget: Task 6.
  - review-to-active tool visibility: Task 7 and Task 8.
- Placeholder scan: no unresolved placeholders.
- Type consistency:
  - Runtime result uses `summary`, `pending`, `summary_failed`.
  - Store record uses `candidateIds`.
  - Model use case is fixed to `memory_extraction`.
