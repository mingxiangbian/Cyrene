# Content Memory Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-tool `daily.md` logging with conservative content-focused daily summaries, and run daily compaction from CLI, REPL, and Web entry points.

**Architecture:** Add a focused `daily-summary.ts` module that owns candidate detection, summary prompting, model-output parsing, validation, and appending. `runAgentLoop` will append at most one summary after a successful final answer. A shared compaction helper will replace REPL-only compaction logic and be called after completed CLI and Web runs.

**Tech Stack:** TypeScript, Node.js fs promises, existing OpenAI-compatible `callModel` abstraction, Vitest.

---

## File Structure

- Create `src/daily-summary.ts`
  - Owns content-memory candidate filtering, prompt construction, JSON parsing, summary validation, date formatting, and `maybeAppendDailySummary()`.
  - Does not know about REPL, Web, or CLI.
- Create `src/daily-compaction.ts`
  - Owns shared post-run compaction check using `loadDailyRaw()` and `compactMemories()`.
  - Keeps compaction best-effort.
- Modify `src/config.ts`
  - Add `dailySummaryMaxLength` with default `400`.
- Modify `src/agent-loop.ts`
  - Remove per-tool daily fact collection and append.
  - Add optional summary logger injection for tests.
  - Call `maybeAppendDailySummary()` once after a successful final response when the loop has the current user prompt.
- Modify `src/repl.ts`
  - Replace local `compactReplDaily()` with shared `compactDailyIfNeeded()`.
  - Allow tests to inject the shared compaction function.
- Modify `src/main.ts`
  - After one-shot CLI run completes, call shared compaction helper.
- Modify `src/web/server.ts`
  - After a Web agent run finishes, call shared compaction helper.
  - Allow tests to inject the shared compaction function.
- Create `tests/daily-summary.test.ts`
  - Unit tests for skip rules, model prompting, validation, and append behavior.
- Create `tests/daily-compaction.test.ts`
  - Unit tests for shared compaction threshold behavior.
- Modify `tests/agent-loop.test.ts`
  - Replace daily per-tool logging expectations with one-summary behavior.
- Modify `tests/repl.test.ts`, `tests/main-cli.test.ts`, and `tests/web-server.test.ts`
  - Verify entry points call shared compaction after successful completion.

---

### Task 1: Config for Daily Summary Length

**Files:**
- Modify: `src/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Write the failing config test**

Add this expectation to the `keeps v1 safety and context limits explicit` test in `tests/config.test.ts`, after `dailyLoadLines`:

```ts
expect(config.dailySummaryMaxLength).toBe(400)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/config.test.ts
```

Expected: FAIL because `dailySummaryMaxLength` does not exist on `AppConfig`.

- [ ] **Step 3: Add config property**

In `src/config.ts`, add the property to `AppConfig`:

```ts
dailySummaryMaxLength: number
```

Add the default in `createDefaultConfig()`:

```ts
dailySummaryMaxLength: 400,
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run tests/config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: configure daily summary length"
```

---

### Task 2: Daily Summary Module

**Files:**
- Create: `src/daily-summary.ts`
- Create: `tests/daily-summary.test.ts`

- [ ] **Step 1: Write failing tests for skip behavior and accepted summaries**

Create `tests/daily-summary.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultConfig } from '../src/config.js'
import {
  buildDailySummaryPrompt,
  hasDailyMemorySignal,
  maybeAppendDailySummary,
  parseDailySummaryResponse,
  validateDailySummary
} from '../src/daily-summary.js'
import type { CallModelInput, ModelResponse } from '../src/llm-client.js'

const tempDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cc-local-daily-summary-'))
  tempDirs.push(dir)
  return dir
}

describe('daily summary filtering', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('skips short ordinary conversations without calling the model', async () => {
    const root = await createTempDir()
    const callModel = vi.fn(async (_input: CallModelInput): Promise<ModelResponse> => ({
      content: '{"shouldRemember":true,"summary":"Should not be used."}',
      toolCalls: []
    }))

    const result = await maybeAppendDailySummary({
      cwd: root,
      config: createDefaultConfig(root),
      userPrompt: 'thanks',
      finalText: 'ok',
      callModel,
      now: new Date('2026-05-20T06:30:00Z')
    })

    expect(result).toBe(false)
    expect(callModel).not.toHaveBeenCalled()
    await expect(readFile(join(root, '.cc-local', 'memory', 'daily.md'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('appends one validated content summary for a memory-worthy turn', async () => {
    const root = await createTempDir()
    await mkdir(join(root, '.cc-local', 'memory'), { recursive: true })
    const callModel = vi.fn(async (_input: CallModelInput): Promise<ModelResponse> => ({
      content: JSON.stringify({
        shouldRemember: true,
        summary: 'User prefers daily memory to store content summaries instead of tool-call logs.'
      }),
      toolCalls: []
    }))

    const result = await maybeAppendDailySummary({
      cwd: root,
      config: createDefaultConfig(root),
      userPrompt: '我希望 memory 记住内容，不要记录工具调用。',
      finalText: '已确认：daily.md 应保存内容摘要，普通工具调用跳过。',
      callModel,
      now: new Date('2026-05-20T06:30:00Z')
    })

    expect(result).toBe(true)
    expect(callModel).toHaveBeenCalledTimes(1)
    await expect(readFile(join(root, '.cc-local', 'memory', 'daily.md'), 'utf8')).resolves.toBe(
      '[2026-05-20 06:30] User prefers daily memory to store content summaries instead of tool-call logs.\n'
    )
  })

  it('rejects invalid, generic, and operational summaries', async () => {
    const config = createDefaultConfig('/tmp/project')

    expect(parseDailySummaryResponse('not json')).toBeNull()
    expect(parseDailySummaryResponse('{"shouldRemember":false,"summary":"Ignored."}')).toEqual({
      shouldRemember: false,
      summary: 'Ignored.'
    })
    expect(validateDailySummary('User asked a question.', config)).toBe(false)
    expect(validateDailySummary('glob -> ok', config)).toBe(false)
    expect(validateDailySummary('Edited src/agent-loop.ts.', config)).toBe(false)
    expect(
      validateDailySummary(
        'Decision: daily memory should skip ordinary tool calls and remember durable content summaries.',
        config
      )
    ).toBe(true)
  })

  it('builds a prompt that explicitly forbids tool and file edit logs', () => {
    const prompt = buildDailySummaryPrompt({
      userPrompt: 'Please remember my preference.',
      finalText: 'Decision: remember content, not tool logs.'
    })

    expect(prompt).toContain('Return only JSON')
    expect(prompt).toContain('Do not summarize routine tool calls')
    expect(prompt).toContain('Do not write file-edit logs')
    expect(prompt).toContain('User prompt:')
    expect(prompt).toContain('Assistant final answer:')
  })

  it('uses hard signals before asking the model', () => {
    expect(hasDailyMemorySignal('hello', 'ok')).toBe(false)
    expect(hasDailyMemorySignal('我希望以后默认跳过工具调用日志', '确认这个偏好。')).toBe(true)
    expect(hasDailyMemorySignal('What was the root cause?', 'Root cause: daily logging appends every tool call.')).toBe(true)
    expect(hasDailyMemorySignal('继续', 'Done.')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/daily-summary.test.ts
```

Expected: FAIL because `src/daily-summary.ts` does not exist.

- [ ] **Step 3: Implement minimal daily summary module**

Create `src/daily-summary.ts`:

```ts
import type { AppConfig } from './config.js'
import type { CallModelInput, ModelResponse } from './llm-client.js'
import { appendDaily } from './daily-logger.js'

export interface DailySummaryPromptInput {
  userPrompt: string
  finalText: string
}

export interface MaybeAppendDailySummaryInput extends DailySummaryPromptInput {
  cwd: string
  config: AppConfig
  callModel: (input: CallModelInput) => Promise<ModelResponse>
  now?: Date
  appendDaily?: (cwd: string, chunks: string[]) => Promise<void>
}

export interface DailySummaryResponse {
  shouldRemember: boolean
  summary: string
}

const durableSignalPatterns = [
  /remember|prefer|preference|default|rule|constraint|decision|decide|design|architecture|root cause|follow[- ]?up|next step|workflow|memory|context|agent behavior|configuration/i,
  /记住|偏好|默认|规则|约束|决定|设计|架构|根因|原因|待办|下一步|记忆|上下文|工具调用|文件修改|工作流/
]

const durableSummaryPatterns = [
  /user prefers|preference|decision|root cause|follow[- ]?up|next step|project fact|workflow|memory|context|should|must|default/i,
  /用户.*(希望|偏好|要求)|决定|根因|原因|待办|下一步|项目事实|工作流|记忆|上下文|应该|必须|默认/
]

const operationalPatterns = [
  /^\s*\[?\d{0,4}[-:\d\s]*\]?\s*(glob|grep|file_read|file_write|file_edit|bash|web_search)\s*->/i,
  /\b(glob|grep|file_read|file_write|file_edit|bash|web_search)\s*->\s*(ok|failed)\b/i,
  /^edited\s+\S+/i,
  /^wrote\s+\S+/i,
  /^ran\s+(rg|grep|glob|npm|git|bash)\b/i
]

const genericSummaries = new Set([
  'user asked a question.',
  'the user asked a question.',
  'assistant answered the question.',
  'the assistant answered the question.'
])

export function hasDailyMemorySignal(userPrompt: string, finalText: string): boolean {
  const combined = `${userPrompt}\n${finalText}`.trim()
  if (combined.length < 40) {
    return false
  }

  return durableSignalPatterns.some((pattern) => pattern.test(combined))
}

export function buildDailySummaryPrompt(input: DailySummaryPromptInput): string {
  return `Review this completed agent turn and decide whether it contains durable context worth saving to short-term daily memory.

Return only JSON in this shape:
{
  "shouldRemember": true,
  "summary": "single sentence durable context"
}

Rules:
- Prefer false when the turn is short, ordinary, or only confirms progress.
- Remember user preferences, project decisions, root causes, unresolved follow-ups, reusable project facts, and workflow rules.
- Do not summarize routine tool calls.
- Do not write file-edit logs.
- Mention tools or files only when their outcome is the durable context.
- Keep the summary as one concise paragraph.

User prompt:
${input.userPrompt}

Assistant final answer:
${input.finalText}`
}

export function parseDailySummaryResponse(content: string): DailySummaryResponse | null {
  try {
    const parsed = JSON.parse(content) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }

    const value = parsed as Record<string, unknown>
    if (typeof value.shouldRemember !== 'boolean' || typeof value.summary !== 'string') {
      return null
    }

    return {
      shouldRemember: value.shouldRemember,
      summary: value.summary
    }
  } catch {
    return null
  }
}

export function validateDailySummary(summary: string, config: AppConfig): boolean {
  const normalized = summary.trim().replace(/\s+/g, ' ')
  if (normalized.length < 20 || normalized.length > config.dailySummaryMaxLength) {
    return false
  }

  if (normalized.includes('\n') || genericSummaries.has(normalized.toLowerCase())) {
    return false
  }

  if (operationalPatterns.some((pattern) => pattern.test(normalized))) {
    return false
  }

  return durableSummaryPatterns.some((pattern) => pattern.test(normalized))
}

export async function maybeAppendDailySummary(input: MaybeAppendDailySummaryInput): Promise<boolean> {
  if (!hasDailyMemorySignal(input.userPrompt, input.finalText)) {
    return false
  }

  let parsed: DailySummaryResponse | null
  try {
    const response = await input.callModel({
      config: input.config,
      messages: [{ role: 'user', content: buildDailySummaryPrompt(input) }],
      tools: []
    })
    parsed = parseDailySummaryResponse(response.content)
  } catch {
    return false
  }

  if (parsed === null || !parsed.shouldRemember || !validateDailySummary(parsed.summary, input.config)) {
    return false
  }

  await (input.appendDaily ?? appendDaily)(input.cwd, [formatDailySummaryEntry(input.now ?? new Date(), parsed.summary)])
  return true
}

function formatDailySummaryEntry(date: Date, summary: string): string {
  return `[${formatDailyTime(date)}] ${summary.trim().replace(/\s+/g, ' ')}`
}

function formatDailyTime(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run tests/daily-summary.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/daily-summary.ts tests/daily-summary.test.ts
git commit -m "feat: add content daily summaries"
```

---

### Task 3: Agent Loop Writes One Content Summary Instead of Tool Facts

**Files:**
- Modify: `src/agent-loop.ts`
- Modify: `tests/agent-loop.test.ts`

- [ ] **Step 1: Write failing tests for new agent-loop daily behavior**

In `tests/agent-loop.test.ts`, replace the existing test named `executes tool calls and feeds the result back to the model` daily assertion with this:

```ts
const dailySummaryCalls: Array<{ userPrompt: string; finalText: string }> = []
```

Pass this into `runAgentLoop`:

```ts
dailySummary: {
  maybeAppendDailySummary: async (summaryInput) => {
    dailySummaryCalls.push({
      userPrompt: summaryInput.userPrompt,
      finalText: summaryInput.finalText
    })
    return true
  }
},
```

Replace the old `dailyChunks` assertions with:

```ts
expect(dailySummaryCalls).toEqual([
  { userPrompt: 'echo', finalText: 'done after tool' }
])
```

Add a new test:

```ts
it('does not append per-tool daily facts for tool-only work', async () => {
  let calls = 0
  const dailyChunks: string[][] = []
  const dailySummaryCalls: string[] = []

  const result = await runAgentLoop({
    config: createDefaultConfig('/tmp/project'),
    systemPrompt: 'system',
    userPrompt: 'echo',
    tools: [echoTool],
    dailyLogger: {
      appendDaily: async (_cwd, chunks) => {
        dailyChunks.push(chunks)
      }
    },
    dailySummary: {
      maybeAppendDailySummary: async (summaryInput) => {
        dailySummaryCalls.push(summaryInput.finalText)
        return false
      }
    },
    callModel: async (): Promise<ModelResponse> => {
      calls += 1
      if (calls === 1) {
        return {
          content: '',
          toolCalls: [{
            id: 'call-1',
            type: 'function',
            function: { name: 'echo', arguments: '{"text":"tool output"}' }
          }]
        }
      }
      return { content: 'done after tool', toolCalls: [] }
    }
  })

  expect(result.finalText).toBe('done after tool')
  expect(dailyChunks).toEqual([])
  expect(dailySummaryCalls).toEqual(['done after tool'])
})
```

Update or remove the test named `logs failed tool calls to daily memory`. Replace it with:

```ts
it('passes failed-tool outcomes only through final-answer content summaries', async () => {
  const config = createDefaultConfig('/tmp/project')
  const dailyChunks: string[][] = []
  const summaryInputs: Array<{ userPrompt: string; finalText: string }> = []
  let calls = 0

  const result = await runAgentLoop({
    config,
    systemPrompt: 'system',
    userPrompt: 'search',
    tools: [failingWebSearchTool],
    dailyLogger: {
      appendDaily: async (_cwd, chunks) => {
        dailyChunks.push(chunks)
      }
    },
    dailySummary: {
      maybeAppendDailySummary: async (summaryInput) => {
        summaryInputs.push({
          userPrompt: summaryInput.userPrompt,
          finalText: summaryInput.finalText
        })
        return false
      }
    },
    callModel: async (): Promise<ModelResponse> => {
      calls += 1
      if (calls === 1) {
        return {
          content: '',
          toolCalls: [{
            id: 'call-search',
            type: 'function',
            function: { name: 'web_search', arguments: '{"query":"latest docs"}' }
          }]
        }
      }
      return { content: 'Root cause: web search is unavailable in this session.', toolCalls: [] }
    }
  })

  expect(result.finalText).toBe('Root cause: web search is unavailable in this session.')
  expect(dailyChunks).toEqual([])
  expect(summaryInputs).toEqual([
    {
      userPrompt: 'search',
      finalText: 'Root cause: web search is unavailable in this session.'
    }
  ])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/agent-loop.test.ts
```

Expected: FAIL because `dailySummary` injection does not exist and the loop still appends per-tool facts.

- [ ] **Step 3: Modify agent-loop daily behavior**

In `src/agent-loop.ts`:

1. Replace:

```ts
import { appendDaily, extractFactFromToolCall } from './daily-logger.js'
```

with:

```ts
import { maybeAppendDailySummary } from './daily-summary.js'
```

2. In `RunAgentLoopInput`, replace the current `dailyLogger` field with:

```ts
dailySummary?: {
  maybeAppendDailySummary: typeof maybeAppendDailySummary
}
```

3. Remove these lines from the tool-call path:

```ts
const dailyFacts: string[] = []
```

and:

```ts
const dailyFact = extractFactFromToolCall({
  toolName: name,
  argumentsText: toolCall.function.arguments,
  ok: result.ok,
  content: result.content
})
if (dailyFact !== null) {
  dailyFacts.push(dailyFact)
}
```

and:

```ts
if (dailyFacts.length > 0) {
  try {
    await (input.dailyLogger?.appendDaily ?? appendDaily)(input.config.cwd, dailyFacts)
  } catch {
    // Daily memory is best-effort and must not block the agent loop.
  }
}
```

4. Before returning a successful final response, call the summary helper:

```ts
const finalText = response.content
messages.push({ role: 'assistant', content: finalText })
notifyObserver(() => observer?.onResponse(finalText))
await appendDailySummaryBestEffort(input, finalText)
return { finalText, toolCallCount }
```

5. Add this helper near `notifyObserver()`:

```ts
async function appendDailySummaryBestEffort(input: RunAgentLoopInput, finalText: string): Promise<void> {
  const userPrompt = input.userPrompt
  if (userPrompt === undefined || userPrompt.trim() === '') {
    return
  }

  try {
    await (input.dailySummary?.maybeAppendDailySummary ?? maybeAppendDailySummary)({
      cwd: input.config.cwd,
      config: input.config,
      userPrompt,
      finalText,
      callModel: input.callModel ?? defaultCallModel
    })
  } catch {
    // Daily memory is best-effort and must not block the agent loop.
  }
}
```

6. Keep `daily-logger.ts` because `daily-summary.ts` still uses `appendDaily()`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx vitest run tests/agent-loop.test.ts tests/daily-logger.test.ts tests/daily-summary.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent-loop.ts tests/agent-loop.test.ts
git commit -m "feat: summarize daily memory by content"
```

---

### Task 4: Shared Daily Compaction Helper

**Files:**
- Create: `src/daily-compaction.ts`
- Create: `tests/daily-compaction.test.ts`
- Modify: `src/repl.ts`
- Modify: `tests/repl.test.ts`

- [ ] **Step 1: Write failing tests for shared compaction**

Create `tests/daily-compaction.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultConfig } from '../src/config.js'
import { compactDailyIfNeeded } from '../src/daily-compaction.js'
import type { CallModelInput, ModelResponse } from '../src/llm-client.js'

const tempDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cc-local-daily-compact-'))
  tempDirs.push(dir)
  return dir
}

describe('compactDailyIfNeeded', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('skips compaction below threshold', async () => {
    const root = await createTempDir()
    const memoryDir = join(root, '.cc-local', 'memory')
    await mkdir(memoryDir, { recursive: true })
    await writeFile(join(memoryDir, 'daily.md'), 'one\n')
    const config = { ...createDefaultConfig(root), dailyCompactThreshold: 2 }
    const callModel = vi.fn(async (_input: CallModelInput): Promise<ModelResponse> => ({ content: 'unused', toolCalls: [] }))
    const compactMemories = vi.fn(async () => ({ ok: true as const, promoted: 1 }))

    await compactDailyIfNeeded({ cwd: root, config, callModel, compactMemories })

    expect(compactMemories).not.toHaveBeenCalled()
    await expect(readFile(join(memoryDir, 'daily.md'), 'utf8')).resolves.toBe('one\n')
  })

  it('runs compaction at threshold with raw daily content', async () => {
    const root = await createTempDir()
    const memoryDir = join(root, '.cc-local', 'memory')
    await mkdir(memoryDir, { recursive: true })
    await writeFile(join(memoryDir, 'daily.md'), 'one\ntwo\n')
    const config = { ...createDefaultConfig(root), dailyCompactThreshold: 2 }
    const callModel = vi.fn(async (_input: CallModelInput): Promise<ModelResponse> => ({ content: 'unused', toolCalls: [] }))
    const compactMemories = vi.fn(async () => ({ ok: true as const, promoted: 1 }))

    await compactDailyIfNeeded({ cwd: root, config, callModel, compactMemories })

    expect(compactMemories).toHaveBeenCalledWith({
      cwd: root,
      dailyContent: 'one\ntwo\n',
      config,
      callModel
    })
  })

  it('does not throw when compaction fails', async () => {
    const root = await createTempDir()
    const memoryDir = join(root, '.cc-local', 'memory')
    await mkdir(memoryDir, { recursive: true })
    await writeFile(join(memoryDir, 'daily.md'), 'one\ntwo\n')
    const config = { ...createDefaultConfig(root), dailyCompactThreshold: 2 }
    const callModel = vi.fn(async (_input: CallModelInput): Promise<ModelResponse> => ({ content: 'unused', toolCalls: [] }))
    const compactMemories = vi.fn(async () => ({ ok: false as const, error: 'bad json' }))

    await expect(compactDailyIfNeeded({ cwd: root, config, callModel, compactMemories })).resolves.toBeUndefined()
    await expect(readFile(join(memoryDir, 'daily.md'), 'utf8')).resolves.toBe('one\ntwo\n')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/daily-compaction.test.ts
```

Expected: FAIL because `src/daily-compaction.ts` does not exist.

- [ ] **Step 3: Implement shared compaction helper**

Create `src/daily-compaction.ts`:

```ts
import type { AppConfig } from './config.js'
import { callModel as defaultCallModel, type CallModelInput, type ModelResponse } from './llm-client.js'
import {
  compactMemories as defaultCompactMemories,
  loadDailyRaw,
  type CompactMemoriesInput,
  type CompactMemoriesResult
} from './memory.js'

export interface CompactDailyIfNeededInput {
  cwd: string
  config: AppConfig
  callModel?: (input: CallModelInput) => Promise<ModelResponse>
  compactMemories?: (input: CompactMemoriesInput) => Promise<CompactMemoriesResult>
}

export async function compactDailyIfNeeded(input: CompactDailyIfNeededInput): Promise<void> {
  const dailyContent = await loadDailyRaw(input.cwd)
  if (countNonEmptyLines(dailyContent) < input.config.dailyCompactThreshold) {
    return
  }

  try {
    await (input.compactMemories ?? defaultCompactMemories)({
      cwd: input.cwd,
      dailyContent,
      config: input.config,
      callModel: input.callModel ?? defaultCallModel
    })
  } catch {
    // Daily compaction should not block the entry point that triggered it.
  }
}

function countNonEmptyLines(content: string): number {
  return content.split(/\r?\n/).filter((line) => line.trim() !== '').length
}
```

- [ ] **Step 4: Refactor REPL to use shared helper**

In `src/repl.ts`:

1. Replace imports of `compactMemories`, `loadDailyRaw`, `CompactMemoriesInput`, and `CompactMemoriesResult` with:

```ts
import { compactDailyIfNeeded, type CompactDailyIfNeededInput } from './daily-compaction.js'
```

2. Change `runRepl()` input injection from:

```ts
compactMemories?: (input: CompactMemoriesInput) => Promise<CompactMemoriesResult>
```

to:

```ts
compactDailyIfNeeded?: (input: CompactDailyIfNeededInput) => Promise<void>
```

3. Replace the graceful exit block with:

```ts
if (gracefulExit) {
  await (inputConfig.compactDailyIfNeeded ?? compactDailyIfNeeded)({
    cwd: inputConfig.config.cwd,
    config: inputConfig.config,
    callModel: inputConfig.callModel ?? defaultCallModel
  })
}
```

4. Delete the local `compactReplDaily()` and `countNonEmptyLines()` functions.

Update `tests/repl.test.ts` injection names:

```ts
const compactDailyIfNeeded = vi.fn(async (_input) => {})
```

and pass:

```ts
compactDailyIfNeeded
```

For the existing threshold tests, either move threshold-specific assertions to `tests/daily-compaction.test.ts` or update REPL tests to assert only that graceful exit delegates:

```ts
expect(compactDailyIfNeeded).toHaveBeenCalledWith({
  cwd: root,
  config,
  callModel
})
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
npx vitest run tests/daily-compaction.test.ts tests/repl.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/daily-compaction.ts src/repl.ts tests/daily-compaction.test.ts tests/repl.test.ts
git commit -m "feat: share daily compaction trigger"
```

---

### Task 5: CLI One-Shot Compaction

**Files:**
- Modify: `src/main.ts`
- Modify: `tests/main-cli.test.ts`

- [ ] **Step 1: Write failing CLI integration test**

First update the import at the top of `tests/main-cli.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
```

Then add this test to `tests/main-cli.test.ts`:

```ts
it('compacts daily memory after a successful one-shot run when threshold is reached', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cc-local-main-compact-'))
  const memoryDir = join(root, '.cc-local', 'memory')
  await mkdir(memoryDir, { recursive: true })
  const dailyContent = Array.from({ length: 500 }, (_value, index) => `line ${index + 1}`).join('\n') + '\n'
  await writeFile(join(memoryDir, 'daily.md'), dailyContent)

  let requestCount = 0
  const server = createServer((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      requestCount += 1
      const parsed = JSON.parse(body) as { messages: Array<{ role: string; content: string }> }
      const prompt = parsed.messages.at(-1)?.content ?? ''
      response.writeHead(200, { 'content-type': 'application/json' })
      if (prompt.includes('Review the daily memory log')) {
        response.end(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                memories: [{
                  title: 'Daily Decision',
                  file: 'daily-decision.md',
                  type: 'project',
                  summary: 'daily decision',
                  content: 'Daily decision content.'
                }]
              })
            }
          }]
        }))
        return
      }
      response.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Expected TCP server address')
  }

  try {
    const result = await execFileAsync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'src/main.ts', '--cwd', root, 'hello'],
      {
        env: cliEnv({
          CC_LOCAL_BASE_URL: `http://127.0.0.1:${address.port}/v1`
        })
      }
    )

    expect(result.stdout.trim()).toBe('ok')
    expect(requestCount).toBe(2)
    await expect(readFile(join(memoryDir, 'daily.md'), 'utf8')).resolves.toBe('')
    await expect(readFile(join(memoryDir, 'daily.archive.md'), 'utf8')).resolves.toBe(dailyContent)
    await expect(readFile(join(memoryDir, 'daily-decision.md'), 'utf8')).resolves.toBe('Daily decision content.')
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
    await rm(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/main-cli.test.ts
```

Expected: FAIL because CLI does not call shared compaction after one-shot runs.

- [ ] **Step 3: Implement CLI compaction**

In `src/main.ts`:

1. Import:

```ts
import { compactDailyIfNeeded } from './daily-compaction.js'
```

2. After printing one-shot results and tool count, call:

```ts
await compactDailyIfNeeded({
  cwd: config.cwd,
  config
})
```

This must happen only after successful `runAgentLoop()`. If `runAgentLoop()` throws, keep existing error behavior and do not compact.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run tests/main-cli.test.ts tests/daily-compaction.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts tests/main-cli.test.ts
git commit -m "feat: compact daily memory after cli runs"
```

---

### Task 6: Web Run Compaction

**Files:**
- Modify: `src/web/server.ts`
- Modify: `tests/web-server.test.ts`

- [ ] **Step 1: Write failing Web compaction test**

Add an optional dependency to `StartWebServerInput` through the test:

```ts
const compactDailyIfNeeded = vi.fn(async () => {})
```

Add this test to `tests/web-server.test.ts`:

```ts
it('checks daily compaction after a successful Web run', async () => {
  const cwd = await createTempCwd()
  const callModel = vi.fn(async (): Promise<ModelResponse> => ({ content: 'web answer', toolCalls: [] }))
  const compactDailyIfNeeded = vi.fn(async () => {})
  const server = await startWebServer({
    cwd,
    host: '127.0.0.1',
    port: 0,
    callModel,
    compactDailyIfNeeded
  })
  servers.push(server)

  const createResponse = await fetch(`${server.url}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'hello web' })
  })
  expect(createResponse.status).toBe(202)
  const createBody = (await createResponse.json()) as { runId: string }

  await readRunEventStream(`${server.url}/api/runs/${createBody.runId}/events`)

  expect(compactDailyIfNeeded).toHaveBeenCalledWith({
    cwd,
    config: expect.objectContaining({ cwd }),
    callModel
  })
})
```

Add this failure-path test:

```ts
it('does not compact daily memory after a failed Web run', async () => {
  const cwd = await createTempCwd()
  const callModel = vi.fn(async (): Promise<ModelResponse> => {
    throw new Error('model unavailable')
  })
  const compactDailyIfNeeded = vi.fn(async () => {})
  const server = await startWebServer({
    cwd,
    host: '127.0.0.1',
    port: 0,
    callModel,
    compactDailyIfNeeded
  })
  servers.push(server)

  const createResponse = await fetch(`${server.url}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'hello web' })
  })
  expect(createResponse.status).toBe(202)
  const createBody = (await createResponse.json()) as { runId: string }

  await readRunEventStream(`${server.url}/api/runs/${createBody.runId}/events`)

  expect(compactDailyIfNeeded).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx vitest run tests/web-server.test.ts
```

Expected: FAIL because `StartWebServerInput` does not accept `compactDailyIfNeeded`.

- [ ] **Step 3: Implement Web compaction injection and call**

In `src/web/server.ts`:

1. Import:

```ts
import { compactDailyIfNeeded as defaultCompactDailyIfNeeded, type CompactDailyIfNeededInput } from '../daily-compaction.js'
```

2. Add to `StartWebServerInput`:

```ts
compactDailyIfNeeded?: (input: CompactDailyIfNeededInput) => Promise<void>
```

3. Add to `WebServerContext`:

```ts
compactDailyIfNeeded?: (input: CompactDailyIfNeededInput) => Promise<void>
```

4. Pass the input through in `routeRequest()` context construction:

```ts
compactDailyIfNeeded: input.compactDailyIfNeeded,
```

5. Change `runWebAgent()` signature to accept the compaction function:

```ts
async function runWebAgent(
  record: RunRecord,
  runtime: Awaited<ReturnType<typeof buildAgentRuntime>>,
  callModel?: (input: CallModelInput) => Promise<ModelResponse>,
  compactDailyIfNeeded?: (input: CompactDailyIfNeededInput) => Promise<void>
): Promise<void>
```

6. After successful `runAgentLoop()` and session update, call:

```ts
await (compactDailyIfNeeded ?? defaultCompactDailyIfNeeded)({
  cwd: runtime.config.cwd,
  config: runtime.config,
  callModel
})
```

Keep this call inside the `try` block after `runAgentLoop()` succeeds. If compaction throws, allow the helper to swallow its own errors; do not emit a Web error event for compaction failure.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx vitest run tests/web-server.test.ts tests/daily-compaction.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/web/server.ts tests/web-server.test.ts
git commit -m "feat: compact daily memory after web runs"
```

---

### Task 7: Full Verification and Cleanup

**Files:**
- Review: `src/daily-summary.ts`
- Review: `src/daily-compaction.ts`
- Review: `src/agent-loop.ts`
- Review: `src/repl.ts`
- Review: `src/main.ts`
- Review: `src/web/server.ts`

- [ ] **Step 1: Run focused memory and entry-point tests**

Run:

```bash
npx vitest run tests/daily-summary.test.ts tests/daily-compaction.test.ts tests/daily-logger.test.ts tests/agent-loop.test.ts tests/repl.test.ts tests/main-cli.test.ts tests/web-server.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Inspect git diff for scope**

Run:

```bash
git diff --stat
git diff -- src/daily-summary.ts src/daily-compaction.ts src/agent-loop.ts src/repl.ts src/main.ts src/web/server.ts
```

Expected:
- No unrelated formatting churn.
- No changes to durable memory file format.
- No per-tool daily append path remains in `runAgentLoop`.
- `daily-logger.ts` still handles low-level append and symlink protections.

- [ ] **Step 5: Commit final verification notes**

When Step 4 shows only expected scoped changes, create the final verification commit only for any test or cleanup edits made during this task:

```bash
git add src tests
git commit -m "test: verify content daily memory flow"
```
