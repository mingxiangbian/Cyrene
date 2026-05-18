# Prism Agent UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished terminal UI for cc-local with Prism Glass colors, a high-recognition ANSI mascot on REPL startup, live thinking/tool status, and no change to the llm-client contract.

**Architecture:** Add a focused `src/ui-observer.ts` module that owns pure UI helpers, mascot rendering, tool summaries, and the terminal `AgentObserver`. `agent-loop.ts` emits safe observer callbacks around model and tool execution, while `repl.ts` and `main.ts` decide where final text is printed so stdout remains pipe-friendly.

**Tech Stack:** TypeScript, Vitest, chalk, Node.js `readline`, Node.js process streams. No new npm dependencies.

---

## Scope

This plan supersedes the earlier terminal UI plan for implementation. It keeps the Observer architecture, fixes final-answer duplication, and adds the approved Prism mascot direction.

First version targets terminal rendering only:

- Implement: Prism palette, soft ANSI styling, card-like line layout, spinner, tool status, REPL welcome, ANSI mascot.
- Do not implement: PNG inline images, true glass blur, web UI, Electron UI, full-screen terminal state, or image protocol detection.

## File Structure

- Create `src/ui-observer.ts`: `AgentObserver` interface, Prism theme constants, render helpers, mascot/welcome rendering, tool icon/summary helpers, terminal observer.
- Modify `src/agent-loop.ts`: add optional observer input and safe callback points with `try/finally`.
- Modify `src/repl.ts`: pass observer, render welcome mascot, add `/help`, `/model`, and empty-input behavior.
- Modify `src/main.ts`: create observer for one-shot mode and keep final answers on stdout.
- Create `tests/ui-observer.test.ts`: pure helper and terminal observer tests.
- Modify `tests/agent-loop.test.ts`: observer lifecycle coverage.
- Modify `tests/repl.test.ts`: welcome, built-in commands, empty input, observer propagation.
- Modify `tests/main-cli.test.ts`: stdout/stderr compatibility.

---

### Task 1: Pure Prism UI Helpers

**Files:**
- Create: `src/ui-observer.ts`
- Create: `tests/ui-observer.test.ts`

- [ ] **Step 1: Write failing tests for tool summaries, icons, palette, mascot, and welcome rendering**

Add this new test file:

```typescript
import { describe, expect, it } from 'vitest'
import {
  PRISM_THEME,
  renderPrismMascot,
  renderWelcome,
  toolCallSummary,
  toolIcon,
  truncateOneLine
} from '../src/ui-observer.js'

describe('toolIcon', () => {
  it.each([
    ['file_read', '📖'],
    ['grep', '📖'],
    ['glob', '📖'],
    ['file_edit', '✏️'],
    ['file_write', '✏️'],
    ['bash', '⚡'],
    ['web_search', '🌐'],
    ['ask_user', '💬'],
    ['unknown', '🔧']
  ])('maps %s to %s', (name, expected) => {
    expect(toolIcon(name)).toBe(expected)
  })
})

describe('toolCallSummary', () => {
  it('summarizes file paths by basename', () => {
    expect(toolCallSummary('file_read', '{"file_path":"/tmp/project/package.json"}')).toBe('package.json')
    expect(toolCallSummary('file_write', '{"file_path":"src/ui-observer.ts"}')).toBe('ui-observer.ts')
  })

  it('summarizes grep, glob, bash, web search, and ask_user arguments', () => {
    expect(toolCallSummary('grep', '{"pattern":"runAgentLoop"}')).toBe('runAgentLoop')
    expect(toolCallSummary('glob', '{"pattern":"src/**/*.ts"}')).toBe('src/**/*.ts')
    expect(toolCallSummary('bash', '{"command":"npm test\\n npm run typecheck"}')).toBe('npm test npm run typecheck')
    expect(toolCallSummary('web_search', '{"query":"terminal glassmorphism ansi ui"}')).toBe('terminal glassmorphism ansi ui')
    expect(toolCallSummary('ask_user', '{"question":"Pick a rendering style"}')).toBe('Pick a rendering style')
  })

  it('includes a line hint for file_edit when present', () => {
    expect(toolCallSummary('file_edit', '{"file_path":"src/repl.ts","line":85}')).toBe('repl.ts:85')
  })

  it('falls back to compact raw text when JSON parsing fails', () => {
    expect(toolCallSummary('bash', 'not-json-with-a-very-long-value-that-keeps-going')).toBe(
      'not-json-with-a-very-long-value-that-keeps'
    )
  })
})

describe('Prism render helpers', () => {
  it('keeps one-line summaries compact', () => {
    expect(truncateOneLine('abc\\ndef', 20)).toBe('abc def')
    expect(truncateOneLine('x'.repeat(65), 60)).toBe(`${'x'.repeat(57)}...`)
  })

  it('exports the approved Prism palette', () => {
    expect(PRISM_THEME.colors.fogWhite).toBe('#F8FBFF')
    expect(PRISM_THEME.colors.softPink).toBe('#F7A8CF')
    expect(PRISM_THEME.colors.iceCyan).toBe('#86E6F1')
    expect(PRISM_THEME.colors.lavender).toBe('#D8B7FF')
    expect(PRISM_THEME.colors.ink).toBe('#2F3545')
  })

  it('renders a high-recognition mascot with hair, braid, clip, coat, and prism accents', () => {
    const mascot = renderPrismMascot({ color: false })
    expect(mascot).toContain('pink hair')
    expect(mascot).toContain('clip')
    expect(mascot).toContain('braid')
    expect(mascot).toContain('ice coat')
    expect(mascot).toContain('✦')
  })

  it('renders a welcome block with mascot, model, and help hint', () => {
    const welcome = renderWelcome({
      modelName: 'Qwen3.5-9B-MLX-4bit',
      color: false
    })
    expect(welcome).toContain('cc-local')
    expect(welcome).toContain('Prism Agent')
    expect(welcome).toContain('Qwen3.5-9B-MLX-4bit')
    expect(welcome).toContain('/help')
  })
})
```

- [ ] **Step 2: Run the helper tests and verify they fail**

Run:

```bash
npm test -- tests/ui-observer.test.ts
```

Expected: FAIL because `src/ui-observer.ts` does not exist.

- [ ] **Step 3: Implement the pure helper exports**

Create `src/ui-observer.ts` with these exports first:

```typescript
import { basename } from 'node:path'
import chalk from 'chalk'

export interface AgentObserver {
  onThinkingStart(): void
  onThinkingStop(durationMs: number): void
  onToolCallStart(name: string, summary: string): void
  onToolCallResult(name: string, ok: boolean, durationMs: number, summary: string): void
  onResponse(text: string): void
}

export const PRISM_THEME = {
  colors: {
    fogWhite: '#F8FBFF',
    iceWhite: '#EAF7FF',
    paleCyan: '#DDF7F8',
    softPink: '#F7A8CF',
    lavender: '#D8B7FF',
    iceCyan: '#86E6F1',
    glassBlue: '#B7D7FF',
    ink: '#2F3545',
    muted: '#6F7A90'
  }
} as const

export function toolIcon(name: string): string {
  if (name === 'file_read' || name === 'grep' || name === 'glob') return '📖'
  if (name === 'file_edit' || name === 'file_write') return '✏️'
  if (name === 'bash') return '⚡'
  if (name === 'web_search') return '🌐'
  if (name === 'ask_user') return '💬'
  return '🔧'
}

export function truncateOneLine(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, Math.max(maxLength - 3, 0))}...`
}

export function toolCallSummary(name: string, argumentsText: string): string {
  let args: Record<string, unknown>
  try {
    args = JSON.parse(argumentsText) as Record<string, unknown>
  } catch {
    return truncateOneLine(argumentsText, 40)
  }

  const stringArg = (key: string): string | undefined => {
    const value = args[key]
    return typeof value === 'string' ? value : undefined
  }

  if (name === 'file_read' || name === 'file_write') {
    return basename(stringArg('file_path') ?? '')
  }
  if (name === 'file_edit') {
    const file = basename(stringArg('file_path') ?? '')
    const line = args.line
    return typeof line === 'number' ? `${file}:${line}` : file
  }
  if (name === 'grep' || name === 'glob') return truncateOneLine(stringArg('pattern') ?? '', 60)
  if (name === 'bash') return truncateOneLine(stringArg('command') ?? '', 60)
  if (name === 'web_search') return truncateOneLine(stringArg('query') ?? '', 60)
  if (name === 'ask_user') return truncateOneLine(stringArg('question') ?? '', 60)
  return truncateOneLine(argumentsText, 40)
}

function maybeColor(text: string, color: boolean, style: (input: string) => string): string {
  return color ? style(text) : text
}

export function renderPrismMascot(options: { color?: boolean } = {}): string {
  const color = options.color ?? true
  const pink = (text: string) => maybeColor(text, color, chalk.hex(PRISM_THEME.colors.softPink))
  const cyan = (text: string) => maybeColor(text, color, chalk.hex(PRISM_THEME.colors.iceCyan))
  const blue = (text: string) => maybeColor(text, color, chalk.hex(PRISM_THEME.colors.glassBlue))
  const violet = (text: string) => maybeColor(text, color, chalk.hex(PRISM_THEME.colors.lavender))
  const dim = (text: string) => maybeColor(text, color, chalk.hex(PRISM_THEME.colors.muted))

  return [
    `${violet('       ✦')} ${dim('prism agent')}`,
    `${pink('    ╭╲╲ pink hair ╱╱╮')} ${cyan('clip')}`,
    `${pink('   ╱  ◕     ◕   ╲')} ${violet('soft eyes')}`,
    `${pink('  │     ▿        │')} ${dim('daily ai')}`,
    `${pink('  ╰╮  braid  ╭╯')} ${pink('braid')}`,
    `${blue('    ╲ ice coat ╱')} ${cyan('✦')}`,
    `${blue('     ╰─ prism ─╯')}`
  ].join('\n')
}

export function renderWelcome(input: { modelName: string; color?: boolean }): string {
  const color = input.color ?? true
  const title = color
    ? `${chalk.hex(PRISM_THEME.colors.iceCyan)('cc-local')} ${chalk.hex(PRISM_THEME.colors.lavender)('·')} ${chalk.hex(PRISM_THEME.colors.softPink)('Prism Agent')}`
    : 'cc-local · Prism Agent'
  const model = color ? chalk.hex(PRISM_THEME.colors.muted)(`${input.modelName} · /help`) : `${input.modelName} · /help`
  return `${renderPrismMascot({ color })}\n${title}\n${model}`
}
```

- [ ] **Step 4: Run the helper tests and verify they pass**

Run:

```bash
npm test -- tests/ui-observer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui-observer.ts tests/ui-observer.test.ts
git commit -m "feat: add prism ui helpers"
```

---

### Task 2: Terminal Observer Rendering

**Files:**
- Modify: `src/ui-observer.ts`
- Modify: `tests/ui-observer.test.ts`

- [ ] **Step 1: Add failing tests for terminal observer output and spinner lifecycle**

Append these tests to `tests/ui-observer.test.ts`:

```typescript
import { Writable } from 'node:stream'
import { afterEach, beforeEach, vi } from 'vitest'
import { createTerminalObserver } from '../src/ui-observer.js'

class MemoryStream extends Writable {
  columns = 80
  chunks: string[] = []

  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(String(chunk))
    callback()
  }

  text(): string {
    return this.chunks.join('')
  }
}

describe('createTerminalObserver', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('prints tool start and result as one card-like line', () => {
    const stream = new MemoryStream()
    const observer = createTerminalObserver(stream, { color: false })

    observer.onToolCallStart('file_read', 'package.json')
    observer.onToolCallResult('file_read', true, 320, '1 | {"name":"cc-local"}')

    expect(stream.text()).toContain('📖 file_read · package.json')
    expect(stream.text()).toContain('✓ 0.3s')
  })

  it('prints failed tool results with compact error text', () => {
    const stream = new MemoryStream()
    const observer = createTerminalObserver(stream, { color: false })

    observer.onToolCallStart('bash', 'npm test')
    observer.onToolCallResult('bash', false, 10, 'x'.repeat(100))

    expect(stream.text()).toContain('⚡ bash · npm test')
    expect(stream.text()).toContain('✗')
    expect(stream.text()).toContain(`${'x'.repeat(77)}...`)
  })

  it('starts and stops the thinking spinner without leaving an interval running', () => {
    const stream = new MemoryStream()
    const observer = createTerminalObserver(stream, { color: false })

    observer.onThinkingStart()
    vi.advanceTimersByTime(240)
    observer.onThinkingStop(240)

    const before = stream.text()
    vi.advanceTimersByTime(240)
    expect(stream.text()).toBe(before)
    expect(before).toContain('Thinking')
  })

  it('prints only a divider on response and leaves final text to the caller', () => {
    const stream = new MemoryStream()
    const observer = createTerminalObserver(stream, { color: false })

    observer.onResponse('final answer')

    expect(stream.text()).toContain('─')
    expect(stream.text()).not.toContain('final answer')
  })
})
```

- [ ] **Step 2: Run tests and verify the observer tests fail**

Run:

```bash
npm test -- tests/ui-observer.test.ts
```

Expected: FAIL because `createTerminalObserver` is not exported.

- [ ] **Step 3: Implement `createTerminalObserver`**

Append this implementation to `src/ui-observer.ts`:

```typescript
import * as readline from 'node:readline'

type OutputStream = NodeJS.WriteStream | (NodeJS.WritableStream & { columns?: number })

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function seconds(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`
}

function write(output: NodeJS.WritableStream, text: string): void {
  output.write(text)
}

function clearCurrentLine(output: NodeJS.WritableStream): void {
  if ('clearLine' in readline && 'cursorTo' in readline) {
    readline.clearLine(output, 0)
    readline.cursorTo(output, 0)
  }
}

export function createTerminalObserver(
  output: OutputStream = process.stderr,
  options: { color?: boolean } = {}
): AgentObserver {
  let spinnerInterval: NodeJS.Timeout | undefined
  let thinkingStartedAt = 0
  let frameIndex = 0
  const color = options.color ?? true
  const paint = (text: string, style: (input: string) => string): string => maybeColor(text, color, style)

  const stopSpinner = (): void => {
    if (spinnerInterval) {
      clearInterval(spinnerInterval)
      spinnerInterval = undefined
    }
    clearCurrentLine(output)
  }

  const renderThinking = (): void => {
    const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length]
    frameIndex += 1
    const elapsed = Date.now() - thinkingStartedAt
    clearCurrentLine(output)
    write(
      output,
      `${paint(frame, chalk.hex(PRISM_THEME.colors.lavender))} ${paint('Thinking', chalk.hex(PRISM_THEME.colors.iceCyan))} ${paint('·', chalk.hex(PRISM_THEME.colors.muted))} ${paint(seconds(elapsed), chalk.hex(PRISM_THEME.colors.softPink))}`
    )
  }

  return {
    onThinkingStart() {
      stopSpinner()
      thinkingStartedAt = Date.now()
      frameIndex = 0
      renderThinking()
      spinnerInterval = setInterval(renderThinking, 80)
    },
    onThinkingStop() {
      stopSpinner()
    },
    onToolCallStart(name, summary) {
      stopSpinner()
      const icon = toolIcon(name)
      write(
        output,
        `\n${paint('╭', chalk.hex(PRISM_THEME.colors.glassBlue))} ${icon} ${paint(name, chalk.hex(PRISM_THEME.colors.ink))} ${paint('·', chalk.hex(PRISM_THEME.colors.muted))} ${paint(summary, chalk.hex(PRISM_THEME.colors.muted))}`
      )
    },
    onToolCallResult(_name, ok, durationMs, summary) {
      if (ok) {
        write(output, `  ${paint('✓', chalk.hex(PRISM_THEME.colors.iceCyan))} ${paint(seconds(durationMs), chalk.hex(PRISM_THEME.colors.muted))}\n`)
        return
      }

      write(
        output,
        `  ${paint('✗', chalk.hex(PRISM_THEME.colors.softPink))} ${paint(truncateOneLine(summary, 80), chalk.hex(PRISM_THEME.colors.softPink))}\n`
      )
    },
    onResponse() {
      stopSpinner()
      const width = Math.max(Math.min(output.columns ?? 60, 100), 20)
      write(output, `${paint('─'.repeat(width), chalk.hex(PRISM_THEME.colors.lavender))}\n`)
    }
  }
}
```

- [ ] **Step 4: Run observer tests**

Run:

```bash
npm test -- tests/ui-observer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui-observer.ts tests/ui-observer.test.ts
git commit -m "feat: render prism terminal observer"
```

---

### Task 3: Observer Integration in Agent Loop

**Files:**
- Modify: `src/agent-loop.ts`
- Modify: `tests/agent-loop.test.ts`

- [ ] **Step 1: Add failing tests for observer lifecycle and UI error isolation**

Append these tests to `tests/agent-loop.test.ts`:

```typescript
import type { AgentObserver } from '../src/ui-observer.js'

it('notifies observer around model calls, tool calls, and final response', async () => {
  const events: string[] = []
  const observer: AgentObserver = {
    onThinkingStart: () => events.push('thinking:start'),
    onThinkingStop: () => events.push('thinking:stop'),
    onToolCallStart: (name, summary) => events.push(`tool:start:${name}:${summary}`),
    onToolCallResult: (name, ok) => events.push(`tool:result:${name}:${ok}`),
    onResponse: () => events.push('response')
  }
  let callCount = 0

  const result = await runAgentLoop({
    config: createDefaultConfig('/tmp/project'),
    systemPrompt: 'system',
    userPrompt: 'echo',
    tools: [echoTool],
    observer,
    callModel: async (): Promise<ModelResponse> => {
      callCount += 1
      if (callCount === 1) {
        return {
          content: '',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'echo', arguments: '{"text":"hello"}' }
            }
          ]
        }
      }
      return { content: 'done', toolCalls: [] }
    }
  })

  expect(result.finalText).toBe('done')
  expect(events).toEqual([
    'thinking:start',
    'thinking:stop',
    'tool:start:echo:{"text":"hello"}',
    'tool:result:echo:true',
    'thinking:start',
    'thinking:stop',
    'response'
  ])
})

it('stops thinking when callModel throws and does not hide the model error', async () => {
  const events: string[] = []
  const observer: AgentObserver = {
    onThinkingStart: () => events.push('thinking:start'),
    onThinkingStop: () => events.push('thinking:stop'),
    onToolCallStart: () => events.push('tool:start'),
    onToolCallResult: () => events.push('tool:result'),
    onResponse: () => events.push('response')
  }

  await expect(
    runAgentLoop({
      config: createDefaultConfig('/tmp/project'),
      systemPrompt: 'system',
      userPrompt: 'hello',
      tools: [],
      observer,
      callModel: async (): Promise<ModelResponse> => {
        throw new Error('model failed')
      }
    })
  ).rejects.toThrow('model failed')

  expect(events).toEqual(['thinking:start', 'thinking:stop'])
})

it('ignores observer errors so UI rendering cannot break the agent loop', async () => {
  const observer: AgentObserver = {
    onThinkingStart: () => {
      throw new Error('ui failed')
    },
    onThinkingStop: () => {
      throw new Error('ui failed')
    },
    onToolCallStart: () => {
      throw new Error('ui failed')
    },
    onToolCallResult: () => {
      throw new Error('ui failed')
    },
    onResponse: () => {
      throw new Error('ui failed')
    }
  }

  const result = await runAgentLoop({
    config: createDefaultConfig('/tmp/project'),
    systemPrompt: 'system',
    userPrompt: 'hello',
    tools: [],
    observer,
    callModel: async (): Promise<ModelResponse> => ({ content: 'final answer', toolCalls: [] })
  })

  expect(result.finalText).toBe('final answer')
})
```

- [ ] **Step 2: Run agent-loop tests and verify failure**

Run:

```bash
npm test -- tests/agent-loop.test.ts
```

Expected: FAIL because `observer` is not accepted by `runAgentLoop`.

- [ ] **Step 3: Add observer input and safe notification helpers**

Modify the imports and base input in `src/agent-loop.ts`:

```typescript
import type { AgentObserver } from './ui-observer.js'
import { toolCallSummary, truncateOneLine } from './ui-observer.js'

interface RunAgentLoopBaseInput {
  config: AppConfig
  tools: Tool<unknown>[]
  observer?: AgentObserver
  toolContext?: ToolContext
  dailyLogger?: {
    appendDaily: (cwd: string, chunks: string[]) => Promise<void>
  }
  callModel?: (input: {
    config: AppConfig
    messages: ChatMessage[]
    tools: unknown[]
  }) => Promise<ModelResponse>
}
```

Add helper functions near the bottom of the file:

```typescript
function notifyObserver(action: () => void): void {
  try {
    action()
  } catch {
    // Terminal UI is best-effort and must not alter agent behavior.
  }
}

function summarizeToolResult(content: string, ok: boolean): string {
  return truncateOneLine(content, ok ? 60 : 80)
}
```

- [ ] **Step 4: Wrap model calls with thinking callbacks**

Replace the direct model call in the main loop with:

```typescript
const modelStartedAt = Date.now()
notifyObserver(() => input.observer?.onThinkingStart())
let response: ModelResponse
try {
  response = await callModel({
    config: input.config,
    messages,
    tools: toolDefinitions(input.tools)
  })
} finally {
  notifyObserver(() => input.observer?.onThinkingStop(Date.now() - modelStartedAt))
}
```

Leave the summarization `callModel` inside `compactHistory` unchanged. That call is internal maintenance, not user-visible agent thinking.

- [ ] **Step 5: Notify final responses without printing duplicate text**

Before each return with final text, call:

```typescript
notifyObserver(() => input.observer?.onResponse(finalText))
```

For the normal final response path, use:

```typescript
messages.push({ role: 'assistant', content: response.content })
notifyObserver(() => input.observer?.onResponse(response.content))
return { finalText: response.content, toolCallCount }
```

For the empty-response failure and max-tool-call stop paths, notify with their generated `finalText`.

- [ ] **Step 6: Notify tool start and result around each tool execution**

Inside the tool-call loop, compute and notify before execution:

```typescript
const name = toolCall.function.name
const summary = toolCallSummary(name, toolCall.function.arguments)
const toolStartedAt = Date.now()
notifyObserver(() => input.observer?.onToolCallStart(name, summary))
```

After `result` is available and before `break` checks, notify:

```typescript
notifyObserver(() =>
  input.observer?.onToolCallResult(
    name,
    result.ok,
    Date.now() - toolStartedAt,
    summarizeToolResult(result.content, result.ok)
  )
)
```

Use `name` consistently in the existing `web_search` availability checks.

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm test -- tests/agent-loop.test.ts tests/ui-observer.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/agent-loop.ts tests/agent-loop.test.ts
git commit -m "feat: emit safe agent observer events"
```

---

### Task 4: REPL Welcome, Mascot, and Built-In Commands

**Files:**
- Modify: `src/repl.ts`
- Modify: `tests/repl.test.ts`

- [ ] **Step 1: Add failing tests for `/help`, `/model`, empty input, and welcome output**

Add these tests to `tests/repl.test.ts`:

```typescript
it('handles empty input without calling the model or mutating history', async () => {
  const messages: ChatMessage[] = [{ role: 'system', content: 'system rules' }]
  const callModel = vi.fn(async (_input: CallModelInput): Promise<ModelResponse> => ({ content: 'unused', toolCalls: [] }))

  const result = await runReplTurn({
    config: createDefaultConfig('/tmp/project'),
    messages,
    input: '   ',
    tools: [],
    callModel
  })

  expect(result).toEqual({ kind: 'handled' })
  expect(callModel).not.toHaveBeenCalled()
  expect(messages).toEqual([{ role: 'system', content: 'system rules' }])
})

it('handles /help and /model without calling the model', async () => {
  const messages: ChatMessage[] = [{ role: 'system', content: 'system rules' }]
  const config = createDefaultConfig('/tmp/project')
  const callModel = vi.fn(async (_input: CallModelInput): Promise<ModelResponse> => ({ content: 'unused', toolCalls: [] }))

  await expect(runReplTurn({ config, messages, input: '/help', tools: [], callModel })).resolves.toEqual({
    kind: 'handled',
    output: expect.stringContaining('/model')
  })
  await expect(runReplTurn({ config, messages, input: '/model', tools: [], callModel })).resolves.toEqual({
    kind: 'handled',
    output: expect.stringContaining(config.model.baseUrl)
  })
  expect(callModel).not.toHaveBeenCalled()
  expect(messages).toEqual([{ role: 'system', content: 'system rules' }])
})

it('prints the Prism mascot welcome before reading REPL input', async () => {
  const config = createDefaultConfig('/tmp/project')
  const readline = createTestReadline(['exit'])
  const compactMemories = vi.fn(async (_input) => ({ ok: true as const, promoted: 0 }))
  const callModel = vi.fn(async (_input: CallModelInput): Promise<ModelResponse> => ({ content: 'unused', toolCalls: [] }))
  const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})

  try {
    await runRepl({
      config,
      systemPrompt: 'system rules',
      tools: [],
      callModel,
      readline,
      compactMemories
    })
  } finally {
    consoleLog.mockRestore()
  }

  expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('Prism Agent'))
  expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining(config.model.model))
})
```

Update existing `runReplTurn` expectations from `{ exit: true }` to `{ kind: 'exit' }`, and from `{ exit: false, ... }` to `{ kind: 'agent', finalText: ..., toolCallCount: ... }`.

- [ ] **Step 2: Run REPL tests and verify failure**

Run:

```bash
npm test -- tests/repl.test.ts
```

Expected: FAIL because `runReplTurn` still returns the old shape.

- [ ] **Step 3: Update REPL imports and result types**

Modify the top of `src/repl.ts`:

```typescript
import { createTerminalObserver, renderWelcome, type AgentObserver } from './ui-observer.js'
```

Change `RunReplTurnInput`:

```typescript
export interface RunReplTurnInput {
  config: AppConfig
  /** Mutable session history. runReplTurn appends the user turn and agent responses in place. */
  messages: ChatMessage[]
  input: string
  tools: Tool<unknown>[]
  observer?: AgentObserver
  toolContext?: ToolContext
  callModel?: (input: CallModelInput) => Promise<ModelResponse>
}
```

Change `RunReplTurnResult`:

```typescript
export type RunReplTurnResult =
  | { kind: 'exit' }
  | { kind: 'handled'; output?: string }
  | { kind: 'agent'; finalText: string; toolCallCount: number }
```

- [ ] **Step 4: Implement command handling before model calls**

Replace the beginning of `runReplTurn` with:

```typescript
const text = input.input.trim()
if (text === '') {
  return { kind: 'handled' }
}
if (isExitInput(text)) {
  return { kind: 'exit' }
}
if (text === '/help') {
  return {
    kind: 'handled',
    output: [
      'Commands:',
      '  /help          Show this help',
      '  /model         Show model info',
      '  exit, quit, q  Exit REPL'
    ].join('\n')
  }
}
if (text === '/model') {
  return {
    kind: 'handled',
    output: [`Model:  ${input.config.model.model}`, `API:    ${input.config.model.baseUrl}`].join('\n')
  }
}
```

Pass `observer` into `runAgentLoop`:

```typescript
const result = await runAgentLoop({
  config: input.config,
  messages: input.messages,
  tools: input.tools,
  observer: input.observer,
  toolContext: input.toolContext,
  callModel: input.callModel
})

return { kind: 'agent', finalText: result.finalText, toolCallCount: result.toolCallCount }
```

- [ ] **Step 5: Render welcome and handle the new result shape in `runRepl`**

Create one observer and print welcome before the loop:

```typescript
const observer = createTerminalObserver(process.stderr)
console.log(renderWelcome({ modelName: inputConfig.config.model.model }))
```

Pass the observer into each turn:

```typescript
const result = await runReplTurn({
  config: inputConfig.config,
  messages,
  input: line,
  tools: inputConfig.tools,
  observer,
  toolContext,
  callModel: inputConfig.callModel
})
```

Handle the result:

```typescript
if (result.kind === 'exit') {
  gracefulExit = true
  break
}

if (result.kind === 'handled') {
  if (result.output) {
    console.log(result.output)
  }
  continue
}

console.log(chalk.green(result.finalText))
if (result.toolCallCount > 0) {
  console.log(chalk.dim(`tool calls: ${result.toolCallCount}`))
}
```

- [ ] **Step 6: Run REPL tests**

Run:

```bash
npm test -- tests/repl.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run related tests**

Run:

```bash
npm test -- tests/repl.test.ts tests/agent-loop.test.ts tests/ui-observer.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/repl.ts tests/repl.test.ts
git commit -m "feat: add prism repl welcome"
```

---

### Task 5: One-Shot Mode Observer and Pipe Compatibility

**Files:**
- Modify: `src/main.ts`
- Modify: `tests/main-cli.test.ts`

- [ ] **Step 1: Add failing CLI test for stdout/stderr separation**

Append this test to `tests/main-cli.test.ts`:

```typescript
it('keeps the final one-shot answer on stdout and UI status on stderr', async () => {
  const server = createServer((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      const parsed = JSON.parse(body) as { messages: Array<{ role: string; content: string }> }
      const hasToolResult = parsed.messages.some((message) => message.role === 'tool')
      response.writeHead(200, { 'content-type': 'application/json' })
      if (!hasToolResult) {
        response.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      id: 'call-1',
                      type: 'function',
                      function: {
                        name: 'glob',
                        arguments: JSON.stringify({ pattern: 'package.json' })
                      }
                    }
                  ]
                }
              }
            ]
          })
        )
        return
      }

      response.end(JSON.stringify({ choices: [{ message: { content: 'final cli answer' } }] }))
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
      ['node_modules/tsx/dist/cli.mjs', 'src/main.ts', '--cwd', process.cwd(), 'find package'],
      {
        env: {
          ...process.env,
          CC_LOCAL_BASE_URL: `http://127.0.0.1:${address.port}/v1`
        }
      }
    )

    expect(result.stdout).toContain('final cli answer')
    expect(result.stdout).not.toContain('glob')
    expect(result.stderr).toContain('glob')
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }
})
```

- [ ] **Step 2: Run the focused CLI test and verify failure**

Run:

```bash
npm test -- tests/main-cli.test.ts
```

Expected: FAIL because one-shot mode does not create an observer yet.

- [ ] **Step 3: Pass the terminal observer in one-shot mode**

Modify imports in `src/main.ts`:

```typescript
import { createTerminalObserver } from './ui-observer.js'
```

Modify the one-shot `runAgentLoop` call:

```typescript
const observer = createTerminalObserver(process.stderr)
const result = await runAgentLoop({
  config,
  systemPrompt,
  userPrompt: prompt,
  tools,
  observer
})
```

Keep the existing final stdout behavior:

```typescript
console.log(chalk.green(result.finalText))
if (result.toolCallCount > 0) {
  console.log(chalk.dim(`tool calls: ${result.toolCallCount}`))
}
```

- [ ] **Step 4: Run CLI tests**

Run:

```bash
npm test -- tests/main-cli.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts tests/main-cli.test.ts
git commit -m "feat: show prism ui in one-shot mode"
```

---

### Task 6: Full Verification and Manual UI Check

**Files:**
- No required source edits.

- [ ] **Step 1: Run the full automated test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Manually verify REPL startup UI**

Run:

```bash
npm run dev -- --repl
```

Expected:

- Startup shows a compact Prism mascot with readable pink-hair, clip, braid, ice-coat, and prism labels.
- The welcome block includes `cc-local`, `Prism Agent`, current model name, and `/help`.
- Empty input returns to the prompt without a model call.
- `/help` prints the command list.
- `/model` prints the model and API base URL.
- `exit` exits and preserves daily compaction behavior.

- [ ] **Step 4: Manually verify one-shot UI**

Run:

```bash
npm run dev -- "读取 package.json 并告诉我项目名"
```

Expected:

- Thinking spinner appears while the model request is active.
- Tool status lines appear on stderr.
- Final answer appears on stdout.
- No duplicate final answer appears in the terminal output.

- [ ] **Step 5: Manually verify pipe behavior**

Run:

```bash
npm run dev -- "读取 package.json 并告诉我项目名" > /tmp/cc-local-answer.txt
cat /tmp/cc-local-answer.txt
```

Expected:

- Terminal still shows UI/tool status from stderr.
- `/tmp/cc-local-answer.txt` contains the final answer and optional `tool calls: N`.
- `/tmp/cc-local-answer.txt` does not contain spinner frames, mascot, or tool status lines.

- [ ] **Step 6: Commit verification-only adjustments if any were required**

If no code changed during verification, skip this commit. If fixes were made, run:

```bash
git add src tests
git commit -m "fix: polish prism terminal ui"
```

---

## Self-Review

- Spec coverage: Observer architecture, terminal rendering, REPL welcome, command handling, one-shot mode, pipe compatibility, and Prism mascot are covered.
- Scope control: The plan excludes PNG inline images and true glass blur because the current product surface is terminal UI.
- Type consistency: `AgentObserver`, `createTerminalObserver`, `renderWelcome`, `renderPrismMascot`, `toolIcon`, `toolCallSummary`, and `truncateOneLine` are defined before later tasks use them.
- Output safety: `onResponse` prints only a divider. Final model text remains the caller's responsibility, preventing duplicate answers.
