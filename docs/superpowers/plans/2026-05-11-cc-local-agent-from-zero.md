# CC Local Agent From Zero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal local Claude Code-style agent that talks to a local MLX/Qwen OpenAI-compatible server, executes a small safe tool set, and teaches the underlying principle at every implementation step.

**Architecture:** The TypeScript CLI owns the agent loop, tool registry, context assembly, and safety gates. Python/MLX only serves the local model through `mlx_lm serve`; the agent communicates with it via `POST /v1/chat/completions` using native tool-calling. The v1 scope intentionally avoids sub-agents, MCP, hooks, React terminal UI, vector memory, and complex permission systems.

**Tech Stack:** Node.js 20+, TypeScript, Vitest, Zod, Commander, Chalk, Tinyglobby, local `mlx_lm serve` endpoint, Qwen3.5-9B-MLX-4bit.

---

## Assumptions

- "CC" means Claude Code-style agent behavior, not training a new foundation model.
- The model directory already exists at `/Users/phoenix/Assistant/CC_based_Agent/Qwen3.5-9B-MLX-4bit`.
- The first usable version should prioritize explainability, determinism, and safety over feature breadth.
- Tool count stays at 8 or fewer because `knowledge/README.md` records an 80% tool-calling benchmark for Qwen3.5-9B-MLX-4bit and warns that accuracy drops when tool count grows.
- File writes and edits are restricted to the current project root in v1. Read can inspect paths outside the root, but mutation cannot.

## Success Criteria

- `npm test` passes.
- `npm run typecheck` passes.
- `./server/start.sh` starts an OpenAI-compatible MLX endpoint on port 8080.
- `npm run dev -- "read package.json"` can call the local model and execute tools when the model returns tool calls.
- A learner can read `docs/cc-local-from-zero.md` and understand the principle behind each subsystem: CLI, loop, tool schema, safety checks, model call, context, and memory boundary.

## Files And Responsibilities

- Create `/Users/phoenix/Assistant/CC_based_Agent/package.json`: Node scripts and runtime dependencies.
- Create `/Users/phoenix/Assistant/CC_based_Agent/tsconfig.json`: strict TypeScript settings.
- Create `/Users/phoenix/Assistant/CC_based_Agent/vitest.config.ts`: test runner config.
- Create `/Users/phoenix/Assistant/CC_based_Agent/src/config.ts`: central runtime limits and endpoint config.
- Create `/Users/phoenix/Assistant/CC_based_Agent/src/tools/types.ts`: shared tool contracts.
- Create `/Users/phoenix/Assistant/CC_based_Agent/src/tools/index.ts`: registry and four-stage tool execution.
- Create `/Users/phoenix/Assistant/CC_based_Agent/src/tools/file-read.ts`: read with numbered output and tracked-file state.
- Create `/Users/phoenix/Assistant/CC_based_Agent/src/tools/file-write.ts`: create or overwrite files under project root.
- Create `/Users/phoenix/Assistant/CC_based_Agent/src/tools/file-edit.ts`: exact replacement with read-before-edit enforcement.
- Create `/Users/phoenix/Assistant/CC_based_Agent/src/tools/grep.ts`: content search with capped output.
- Create `/Users/phoenix/Assistant/CC_based_Agent/src/tools/glob.ts`: path discovery.
- Create `/Users/phoenix/Assistant/CC_based_Agent/src/tools/bash.ts`: shell command runner with deny-list and timeout.
- Create `/Users/phoenix/Assistant/CC_based_Agent/src/tools/ask-user.ts`: structured handoff when the model needs clarification.
- Create `/Users/phoenix/Assistant/CC_based_Agent/src/llm-client.ts`: OpenAI-compatible model client.
- Create `/Users/phoenix/Assistant/CC_based_Agent/src/context.ts`: message assembly and simple output compaction.
- Create `/Users/phoenix/Assistant/CC_based_Agent/src/agent-loop.ts`: ReAct-style loop: call model, execute tools, feed results back.
- Create `/Users/phoenix/Assistant/CC_based_Agent/src/main.ts`: CLI entry point.
- Create `/Users/phoenix/Assistant/CC_based_Agent/src/prompts/system.md`: compact local-agent system prompt.
- Create `/Users/phoenix/Assistant/CC_based_Agent/server/start.sh`: MLX server launcher.
- Create `/Users/phoenix/Assistant/CC_based_Agent/docs/cc-local-from-zero.md`: learning guide.
- Create `/Users/phoenix/Assistant/CC_based_Agent/tests/*.test.ts`: focused unit tests for the core behavior.

---

### Task 1: Project Scaffold

**Principle:** Before agent behavior exists, create a repeatable TypeScript test harness. This makes every later subsystem verifiable instead of relying on manual CLI experiments.

**Files:**
- Create: `/Users/phoenix/Assistant/CC_based_Agent/package.json`
- Create: `/Users/phoenix/Assistant/CC_based_Agent/tsconfig.json`
- Create: `/Users/phoenix/Assistant/CC_based_Agent/vitest.config.ts`

- [ ] **Step 1: Create package manifest**

```json
{
  "name": "cc-local",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/main.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "chalk": "^5.4.1",
    "commander": "^12.1.0",
    "tinyglobby": "^0.2.10",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.5",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create Vitest config**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true
  }
})
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`

Expected: `package-lock.json` is created and npm exits with code 0.

- [ ] **Step 5: Verify empty scaffold**

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit scaffold**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts
git commit -m "chore: scaffold cc-local typescript project"
```

---

### Task 2: Config And Shared Tool Types

**Principle:** Tool-calling agents are safer when every tool has a typed schema, declared safety properties, and one execution contract. This keeps behavior predictable even when the model emits imperfect arguments.

**Files:**
- Create: `/Users/phoenix/Assistant/CC_based_Agent/src/config.ts`
- Create: `/Users/phoenix/Assistant/CC_based_Agent/src/tools/types.ts`
- Test: `/Users/phoenix/Assistant/CC_based_Agent/tests/config.test.ts`

- [ ] **Step 1: Write config tests**

```ts
import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../src/config.js'

describe('createDefaultConfig', () => {
  it('uses the local MLX OpenAI-compatible endpoint by default', () => {
    const config = createDefaultConfig('/tmp/project')

    expect(config.model.baseUrl).toBe('http://127.0.0.1:8080/v1')
    expect(config.model.model).toBe('Qwen3.5-9B-MLX-4bit')
    expect(config.model.temperature).toBe(0)
  })

  it('keeps v1 safety and context limits explicit', () => {
    const config = createDefaultConfig('/tmp/project')

    expect(config.cwd).toBe('/tmp/project')
    expect(config.maxToolCallsPerTurn).toBe(10)
    expect(config.readMaxInlineLines).toBe(500)
    expect(config.bashTimeoutMs).toBe(120_000)
    expect(config.writableRoots).toEqual(['/tmp/project'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/config.test.ts`

Expected: FAIL because `src/config.ts` does not exist.

- [ ] **Step 3: Implement config**

```ts
export interface ModelConfig {
  baseUrl: string
  model: string
  temperature: number
}

export interface AppConfig {
  cwd: string
  model: ModelConfig
  maxToolCallsPerTurn: number
  readMaxInlineLines: number
  grepMaxMatches: number
  bashTimeoutMs: number
  writableRoots: string[]
  bashDenyPatterns: RegExp[]
}

export function createDefaultConfig(cwd: string): AppConfig {
  return {
    cwd,
    model: {
      baseUrl: process.env.CC_LOCAL_BASE_URL ?? 'http://127.0.0.1:8080/v1',
      model: process.env.CC_LOCAL_MODEL ?? 'Qwen3.5-9B-MLX-4bit',
      temperature: 0
    },
    maxToolCallsPerTurn: 10,
    readMaxInlineLines: 500,
    grepMaxMatches: 30,
    bashTimeoutMs: 120_000,
    writableRoots: [cwd],
    bashDenyPatterns: [
      /rm\s+-rf\s+\//,
      /mkfs\./,
      /dd\s+if=/,
      />\s*\/dev\/sd/,
      /curl\b.*\|\s*sh/,
      /:\(\)\s*\{\s*:\|:&\s*\};:/
    ]
  }
}
```

- [ ] **Step 4: Implement shared tool types**

```ts
import type { z } from 'zod'
import type { AppConfig } from '../config.js'

export interface JsonSchema {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

export interface ToolContext {
  config: AppConfig
  trackedFiles: Set<string>
}

export interface ToolResult {
  ok: boolean
  content: string
  metadata?: Record<string, unknown>
}

export interface Tool<TArgs> {
  name: string
  description: string
  parameters: JsonSchema
  schema: z.ZodType<TArgs>
  isReadonly: boolean
  isDestructive: boolean
  isConcurrencySafe: boolean
  needsUserInteraction: boolean
  execute(args: TArgs, context: ToolContext): Promise<ToolResult>
}

export interface ToolCall {
  id: string
  name: string
  argumentsText: string
}
```

- [ ] **Step 5: Verify config and types**

Run: `npm test -- tests/config.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit config and types**

```bash
git add src/config.ts src/tools/types.ts tests/config.test.ts
git commit -m "feat: add config and tool contracts"
```

---

### Task 3: Tool Registry With Validation

**Principle:** The model proposes tool calls; the program decides whether they are valid. A registry gives one place for JSON parsing, Zod validation, safety checks, execution, and result formatting.

**Files:**
- Create: `/Users/phoenix/Assistant/CC_based_Agent/src/tools/index.ts`
- Test: `/Users/phoenix/Assistant/CC_based_Agent/tests/tool-registry.test.ts`

- [ ] **Step 1: Write registry tests**

```ts
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../src/config.js'
import { executeToolCall } from '../src/tools/index.js'
import type { Tool, ToolContext } from '../src/tools/types.js'

const echoTool: Tool<{ text: string }> = {
  name: 'echo',
  description: 'Echo text.',
  parameters: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false
  },
  schema: z.object({ text: z.string() }),
  isReadonly: true,
  isDestructive: false,
  isConcurrencySafe: false,
  needsUserInteraction: false,
  async execute(args) {
    return { ok: true, content: args.text }
  }
}

function context(): ToolContext {
  return {
    config: createDefaultConfig('/tmp/project'),
    trackedFiles: new Set<string>()
  }
}

describe('executeToolCall', () => {
  it('executes a valid registered tool call', async () => {
    const result = await executeToolCall(
      { id: 'call-1', name: 'echo', argumentsText: '{"text":"hello"}' },
      [echoTool],
      context()
    )

    expect(result.ok).toBe(true)
    expect(result.content).toBe('hello')
  })

  it('rejects unknown tools', async () => {
    const result = await executeToolCall(
      { id: 'call-1', name: 'missing', argumentsText: '{}' },
      [echoTool],
      context()
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('Unknown tool: missing')
  })

  it('rejects invalid JSON arguments', async () => {
    const result = await executeToolCall(
      { id: 'call-1', name: 'echo', argumentsText: '{bad json' },
      [echoTool],
      context()
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('Invalid JSON arguments')
  })

  it('rejects arguments that fail schema validation', async () => {
    const result = await executeToolCall(
      { id: 'call-1', name: 'echo', argumentsText: '{"text":123}' },
      [echoTool],
      context()
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('Invalid arguments for tool echo')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tool-registry.test.ts`

Expected: FAIL because `executeToolCall` is not implemented.

- [ ] **Step 3: Implement registry**

```ts
import type { Tool, ToolCall, ToolContext, ToolResult } from './types.js'

export function toolDefinitions(tools: Tool<unknown>[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }))
}

export async function executeToolCall(
  call: ToolCall,
  tools: Tool<unknown>[],
  context: ToolContext
): Promise<ToolResult> {
  const tool = tools.find((candidate) => candidate.name === call.name)
  if (!tool) {
    return { ok: false, content: `Unknown tool: ${call.name}` }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(call.argumentsText)
  } catch {
    return { ok: false, content: `Invalid JSON arguments for tool ${call.name}` }
  }

  const validation = tool.schema.safeParse(parsed)
  if (!validation.success) {
    return {
      ok: false,
      content: `Invalid arguments for tool ${call.name}: ${validation.error.message}`
    }
  }

  try {
    return await tool.execute(validation.data, context)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, content: `Tool ${call.name} failed: ${message}` }
  }
}
```

- [ ] **Step 4: Verify registry**

Run: `npm test -- tests/tool-registry.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit registry**

```bash
git add src/tools/index.ts tests/tool-registry.test.ts
git commit -m "feat: add tool registry validation"
```

---

### Task 4: File Read Tool

**Principle:** Claude Code-style editing depends on read-before-edit. The read tool does two jobs: it returns content to the model and records that the file is now known in this session.

**Files:**
- Create: `/Users/phoenix/Assistant/CC_based_Agent/src/tools/file-read.ts`
- Test: `/Users/phoenix/Assistant/CC_based_Agent/tests/file-read.test.ts`

- [ ] **Step 1: Write read tool tests**

```ts
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../src/config.js'
import { fileReadTool } from '../src/tools/file-read.js'

describe('fileReadTool', () => {
  it('returns numbered lines and tracks the real file path', async () => {
    const root = join(process.cwd(), '.tmp-file-read-test')
    const file = join(root, 'note.txt')
    await mkdir(root, { recursive: true })
    await writeFile(file, 'alpha\nbeta\n', 'utf8')

    const trackedFiles = new Set<string>()
    const result = await fileReadTool.execute(
      { file_path: file },
      { config: createDefaultConfig(root), trackedFiles }
    )

    expect(result.ok).toBe(true)
    expect(result.content).toContain('1 | alpha')
    expect(result.content).toContain('2 | beta')
    expect([...trackedFiles]).toContain(file)
  })

  it('returns a helpful failure when the file does not exist', async () => {
    const root = join(process.cwd(), '.tmp-file-read-missing-test')
    await mkdir(root, { recursive: true })

    const result = await fileReadTool.execute(
      { file_path: join(root, 'missing.txt') },
      { config: createDefaultConfig(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('Unable to read file')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/file-read.test.ts`

Expected: FAIL because `file-read.ts` does not exist.

- [ ] **Step 3: Implement file read**

```ts
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { z } from 'zod'
import type { Tool } from './types.js'

const schema = z.object({
  file_path: z.string().min(1)
})

function resolveFromCwd(cwd: string, filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(cwd, filePath)
}

function numberLines(content: string): string {
  const lines = content.split(/\r?\n/)
  return lines.map((line, index) => `${index + 1} | ${line}`).join('\n')
}

export const fileReadTool: Tool<z.infer<typeof schema>> = {
  name: 'file_read',
  description: 'Read a UTF-8 text file. Returns content with line numbers and records the file as read for later edits.',
  parameters: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path or path relative to the current working directory.' }
    },
    required: ['file_path'],
    additionalProperties: false
  },
  schema,
  isReadonly: true,
  isDestructive: false,
  isConcurrencySafe: false,
  needsUserInteraction: false,
  async execute(args, context) {
    const resolved = resolveFromCwd(context.config.cwd, args.file_path)

    try {
      const canonical = await realpath(resolved)
      const content = await readFile(canonical, 'utf8')
      context.trackedFiles.add(canonical)

      const lineCount = content.split(/\r?\n/).length
      if (lineCount > context.config.readMaxInlineLines) {
        const lines = content.split(/\r?\n/)
        const compact = [...lines.slice(0, 100), '[output compacted]', ...lines.slice(-50)].join('\n')
        return { ok: true, content: numberLines(compact), metadata: { path: canonical, compacted: true } }
      }

      return { ok: true, content: numberLines(content), metadata: { path: canonical } }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, content: `Unable to read file ${resolved}: ${message}` }
    }
  }
}
```

- [ ] **Step 4: Verify file read**

Run: `npm test -- tests/file-read.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit file read**

```bash
git add src/tools/file-read.ts tests/file-read.test.ts
git commit -m "feat: add file read tool"
```

---

### Task 5: File Write And File Edit Tools

**Principle:** Writes are mutation, so v1 keeps them inside the project root. Edits require exact string replacement and a prior read so the model cannot patch a file it has not inspected.

**Files:**
- Create: `/Users/phoenix/Assistant/CC_based_Agent/src/tools/file-write.ts`
- Create: `/Users/phoenix/Assistant/CC_based_Agent/src/tools/file-edit.ts`
- Test: `/Users/phoenix/Assistant/CC_based_Agent/tests/file-mutation.test.ts`

- [ ] **Step 1: Write mutation tests**

```ts
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../src/config.js'
import { fileEditTool } from '../src/tools/file-edit.js'
import { fileWriteTool } from '../src/tools/file-write.js'

describe('file mutation tools', () => {
  it('writes files under the configured writable root', async () => {
    const root = join(process.cwd(), '.tmp-file-write-test')
    await mkdir(root, { recursive: true })
    const file = join(root, 'created.txt')

    const result = await fileWriteTool.execute(
      { file_path: file, content: 'hello\n' },
      { config: createDefaultConfig(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(true)
    expect(await readFile(file, 'utf8')).toBe('hello\n')
  })

  it('rejects writes outside the configured writable root', async () => {
    const root = join(process.cwd(), '.tmp-file-write-root-test')
    await mkdir(root, { recursive: true })

    const result = await fileWriteTool.execute(
      { file_path: '/tmp/outside-cc-local.txt', content: 'no\n' },
      { config: createDefaultConfig(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('outside writable roots')
  })

  it('edits only after the file was read in this session', async () => {
    const root = join(process.cwd(), '.tmp-file-edit-test')
    const file = join(root, 'edit.txt')
    await mkdir(root, { recursive: true })
    await writeFile(file, 'port=3000\n', 'utf8')

    const canonical = await realpath(file)
    const trackedFiles = new Set<string>([canonical])
    const result = await fileEditTool.execute(
      { file_path: file, old_string: 'port=3000', new_string: 'port=8080' },
      { config: createDefaultConfig(root), trackedFiles }
    )

    expect(result.ok).toBe(true)
    expect(await readFile(file, 'utf8')).toBe('port=8080\n')
  })

  it('rejects edit when the file was not read first', async () => {
    const root = join(process.cwd(), '.tmp-file-edit-unread-test')
    const file = join(root, 'edit.txt')
    await mkdir(root, { recursive: true })
    await writeFile(file, 'port=3000\n', 'utf8')

    const result = await fileEditTool.execute(
      { file_path: file, old_string: 'port=3000', new_string: 'port=8080' },
      { config: createDefaultConfig(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('must read the file before editing')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/file-mutation.test.ts`

Expected: FAIL because write and edit tools do not exist.

- [ ] **Step 3: Implement file write**

```ts
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'
import type { Tool } from './types.js'

const schema = z.object({
  file_path: z.string().min(1),
  content: z.string()
})

function resolveFromCwd(cwd: string, filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(cwd, filePath)
}

async function isUnderWritableRoot(path: string, roots: string[]): Promise<boolean> {
  for (const root of roots) {
    const relativePath = relative(await realpath(root), path)
    if (relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))) {
      return true
    }
  }
  return false
}

export const fileWriteTool: Tool<z.infer<typeof schema>> = {
  name: 'file_write',
  description: 'Create or overwrite a UTF-8 text file inside the project writable root.',
  parameters: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path or path relative to the current working directory.' },
      content: { type: 'string', description: 'Complete file content to write.' }
    },
    required: ['file_path', 'content'],
    additionalProperties: false
  },
  schema,
  isReadonly: false,
  isDestructive: true,
  isConcurrencySafe: false,
  needsUserInteraction: false,
  async execute(args, context) {
    const resolved = resolveFromCwd(context.config.cwd, args.file_path)
    const parent = dirname(resolved)
    await mkdir(parent, { recursive: true })

    if (!(await isUnderWritableRoot(resolved, context.config.writableRoots))) {
      return { ok: false, content: `Refusing to write ${resolved}: outside writable roots.` }
    }

    await writeFile(resolved, args.content, 'utf8')
    context.trackedFiles.add(resolved)
    return { ok: true, content: `Wrote ${resolved}` }
  }
}
```

- [ ] **Step 4: Implement file edit**

```ts
import { readFile, realpath, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'
import type { Tool } from './types.js'

const schema = z.object({
  file_path: z.string().min(1),
  old_string: z.string().min(1),
  new_string: z.string()
})

function resolveFromCwd(cwd: string, filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(cwd, filePath)
}

async function isUnderWritableRoot(path: string, roots: string[]): Promise<boolean> {
  for (const root of roots) {
    const relativePath = relative(await realpath(root), path)
    if (relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))) {
      return true
    }
  }
  return false
}

export const fileEditTool: Tool<z.infer<typeof schema>> = {
  name: 'file_edit',
  description: 'Replace one exact string in a UTF-8 file. The file must have been read earlier in the session.',
  parameters: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path or path relative to the current working directory.' },
      old_string: { type: 'string', description: 'Exact text currently present in the file.' },
      new_string: { type: 'string', description: 'Replacement text.' }
    },
    required: ['file_path', 'old_string', 'new_string'],
    additionalProperties: false
  },
  schema,
  isReadonly: false,
  isDestructive: true,
  isConcurrencySafe: false,
  needsUserInteraction: false,
  async execute(args, context) {
    const resolved = resolveFromCwd(context.config.cwd, args.file_path)
    const canonical = await realpath(resolved)

    if (!context.trackedFiles.has(canonical)) {
      return { ok: false, content: `Refusing to edit ${canonical}: must read the file before editing.` }
    }

    if (!(await isUnderWritableRoot(canonical, context.config.writableRoots))) {
      return { ok: false, content: `Refusing to edit ${canonical}: outside writable roots.` }
    }

    const content = await readFile(canonical, 'utf8')
    const occurrences = content.split(args.old_string).length - 1
    if (occurrences !== 1) {
      return { ok: false, content: `Expected exactly one match for old_string, found ${occurrences}.` }
    }

    await writeFile(canonical, content.replace(args.old_string, args.new_string), 'utf8')
    return { ok: true, content: `Edited ${canonical}` }
  }
}
```

- [ ] **Step 5: Verify mutation tools**

Run: `npm test -- tests/file-mutation.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit mutation tools**

```bash
git add src/tools/file-write.ts src/tools/file-edit.ts tests/file-mutation.test.ts
git commit -m "feat: add safe file mutation tools"
```

---

### Task 6: Search Tools

**Principle:** Agents need low-cost project discovery. `glob` finds files by name; `grep` finds text inside files. Keeping them separate reduces tool confusion for small local models.

**Files:**
- Create: `/Users/phoenix/Assistant/CC_based_Agent/src/tools/glob.ts`
- Create: `/Users/phoenix/Assistant/CC_based_Agent/src/tools/grep.ts`
- Test: `/Users/phoenix/Assistant/CC_based_Agent/tests/search-tools.test.ts`

- [ ] **Step 1: Write search tests**

```ts
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../src/config.js'
import { globTool } from '../src/tools/glob.js'
import { grepTool } from '../src/tools/grep.js'

describe('search tools', () => {
  it('finds files with glob patterns', async () => {
    const root = join(process.cwd(), '.tmp-glob-test')
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'src', 'a.ts'), 'export const a = 1\n')

    const result = await globTool.execute(
      { pattern: 'src/**/*.ts' },
      { config: createDefaultConfig(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(true)
    expect(result.content).toContain('src/a.ts')
  })

  it('finds matching lines with grep', async () => {
    const root = join(process.cwd(), '.tmp-grep-test')
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'src', 'a.ts'), 'const token = "abc"\n')

    const result = await grepTool.execute(
      { pattern: 'token', path: 'src', include: '*.ts' },
      { config: createDefaultConfig(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(true)
    expect(result.content).toContain('src/a.ts:1: const token = "abc"')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/search-tools.test.ts`

Expected: FAIL because search tools do not exist.

- [ ] **Step 3: Implement glob**

```ts
import { relative } from 'node:path'
import { glob } from 'tinyglobby'
import { z } from 'zod'
import type { Tool } from './types.js'

const schema = z.object({
  pattern: z.string().min(1)
})

export const globTool: Tool<z.infer<typeof schema>> = {
  name: 'glob',
  description: 'Find files matching a glob pattern relative to the current working directory.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: "Glob pattern such as 'src/**/*.ts'." }
    },
    required: ['pattern'],
    additionalProperties: false
  },
  schema,
  isReadonly: true,
  isDestructive: false,
  isConcurrencySafe: false,
  needsUserInteraction: false,
  async execute(args, context) {
    const matches = await glob(args.pattern, {
      cwd: context.config.cwd,
      absolute: true,
      onlyFiles: true,
      dot: true
    })

    const output = matches.map((path) => relative(context.config.cwd, path)).sort().join('\n')
    return { ok: true, content: output || 'No files matched.' }
  }
}
```

- [ ] **Step 4: Implement grep**

```ts
import { readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { glob } from 'tinyglobby'
import { z } from 'zod'
import type { Tool } from './types.js'

const schema = z.object({
  pattern: z.string().min(1),
  path: z.string().min(1).optional(),
  include: z.string().min(1).optional()
})

export const grepTool: Tool<z.infer<typeof schema>> = {
  name: 'grep',
  description: 'Search UTF-8 text files for a JavaScript regular expression. Returns path, line number, and matching line.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'JavaScript regular expression.' },
      path: { type: 'string', description: 'Directory or file path relative to current working directory.' },
      include: { type: 'string', description: "Optional glob include such as '*.ts'." }
    },
    required: ['pattern'],
    additionalProperties: false
  },
  schema,
  isReadonly: true,
  isDestructive: false,
  isConcurrencySafe: false,
  needsUserInteraction: false,
  async execute(args, context) {
    const searchRoot = args.path ?? '.'
    const include = args.include ?? '**/*'
    const files = await glob(include, {
      cwd: resolve(context.config.cwd, searchRoot),
      absolute: true,
      onlyFiles: true,
      dot: true
    })

    const regex = new RegExp(args.pattern)
    const matches: string[] = []
    for (const file of files) {
      const content = await readFile(file, 'utf8').catch(() => '')
      const lines = content.split(/\r?\n/)
      for (let index = 0; index < lines.length; index += 1) {
        if (regex.test(lines[index])) {
          matches.push(`${relative(context.config.cwd, file)}:${index + 1}: ${lines[index]}`)
          if (matches.length >= context.config.grepMaxMatches) {
            return { ok: true, content: matches.join('\n'), metadata: { truncated: true } }
          }
        }
      }
    }

    return { ok: true, content: matches.join('\n') || 'No matches.' }
  }
}
```

- [ ] **Step 5: Verify search tools**

Run: `npm test -- tests/search-tools.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit search tools**

```bash
git add src/tools/glob.ts src/tools/grep.ts tests/search-tools.test.ts
git commit -m "feat: add project search tools"
```

---

### Task 7: Bash And Ask-User Tools

**Principle:** Bash is powerful and risky, so it needs a deny-list, timeout, and persistent working directory. `ask_user` is not a real side effect; it lets the loop stop with a clear clarification request.

**Files:**
- Create: `/Users/phoenix/Assistant/CC_based_Agent/src/tools/bash.ts`
- Create: `/Users/phoenix/Assistant/CC_based_Agent/src/tools/ask-user.ts`
- Test: `/Users/phoenix/Assistant/CC_based_Agent/tests/bash-and-ask.test.ts`

- [ ] **Step 1: Write bash and ask tests**

```ts
import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../src/config.js'
import { askUserTool } from '../src/tools/ask-user.js'
import { bashTool } from '../src/tools/bash.js'

describe('bashTool', () => {
  it('executes safe shell commands in the configured working directory', async () => {
    const result = await bashTool.execute(
      { command: 'pwd', description: 'print working directory' },
      { config: createDefaultConfig(process.cwd()), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(true)
    expect(result.content).toContain(process.cwd())
  })

  it('rejects deny-listed destructive commands', async () => {
    const result = await bashTool.execute(
      { command: 'rm -rf /', description: 'dangerous command' },
      { config: createDefaultConfig(process.cwd()), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('deny-list')
  })
})

describe('askUserTool', () => {
  it('returns the question as a tool result', async () => {
    const result = await askUserTool.execute(
      { question: 'Which file should I edit?' },
      { config: createDefaultConfig(process.cwd()), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(true)
    expect(result.content).toBe('Question for user: Which file should I edit?')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/bash-and-ask.test.ts`

Expected: FAIL because bash and ask-user tools do not exist.

- [ ] **Step 3: Implement bash**

```ts
import { spawn } from 'node:child_process'
import { z } from 'zod'
import type { Tool } from './types.js'

const schema = z.object({
  command: z.string().min(1),
  description: z.string().optional()
})

function runCommand(command: string, cwd: string, timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref()
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

export const bashTool: Tool<z.infer<typeof schema>> = {
  name: 'bash',
  description: 'Execute a shell command in the current working directory. Use for tests, git, and project commands.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute.' },
      description: { type: 'string', description: 'Short human-readable reason for running this command.' }
    },
    required: ['command'],
    additionalProperties: false
  },
  schema,
  isReadonly: false,
  isDestructive: true,
  isConcurrencySafe: false,
  needsUserInteraction: false,
  async execute(args, context) {
    const denied = context.config.bashDenyPatterns.find((pattern) => pattern.test(args.command))
    if (denied) {
      return { ok: false, content: `Refusing bash command because it matched the deny-list: ${denied}` }
    }

    const result = await runCommand(args.command, context.config.cwd, context.config.bashTimeoutMs)
    const content = [
      `Working directory: ${context.config.cwd}`,
      `Exit code: ${result.code}`,
      result.stdout ? `stdout:\n${result.stdout}` : 'stdout: <empty>',
      result.stderr ? `stderr:\n${result.stderr}` : 'stderr: <empty>'
    ].join('\n')

    return { ok: result.code === 0, content }
  }
}
```

- [ ] **Step 4: Implement ask-user**

```ts
import { z } from 'zod'
import type { Tool } from './types.js'

const schema = z.object({
  question: z.string().min(1)
})

export const askUserTool: Tool<z.infer<typeof schema>> = {
  name: 'ask_user',
  description: 'Ask the user one concise clarification question when required information is missing.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'One concise question for the user.' }
    },
    required: ['question'],
    additionalProperties: false
  },
  schema,
  isReadonly: true,
  isDestructive: false,
  isConcurrencySafe: false,
  needsUserInteraction: true,
  async execute(args) {
    return { ok: true, content: `Question for user: ${args.question}` }
  }
}
```

- [ ] **Step 5: Verify bash and ask-user**

Run: `npm test -- tests/bash-and-ask.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit bash and ask-user**

```bash
git add src/tools/bash.ts src/tools/ask-user.ts tests/bash-and-ask.test.ts
git commit -m "feat: add bash and ask-user tools"
```

---

### Task 8: LLM Client

**Principle:** The agent loop should not know HTTP details. The client accepts messages and tool definitions, calls the local OpenAI-compatible endpoint, and returns either assistant text or tool calls.

**Files:**
- Create: `/Users/phoenix/Assistant/CC_based_Agent/src/llm-client.ts`
- Test: `/Users/phoenix/Assistant/CC_based_Agent/tests/llm-client.test.ts`

- [ ] **Step 1: Write LLM client test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultConfig } from '../src/config.js'
import { callModel } from '../src/llm-client.js'

describe('callModel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts OpenAI-compatible chat completion requests', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'done'
            }
          }
        ]
      })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await callModel({
      config: createDefaultConfig('/tmp/project'),
      messages: [{ role: 'user', content: 'hello' }],
      tools: []
    })

    expect(response.content).toBe('done')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/llm-client.test.ts`

Expected: FAIL because `llm-client.ts` does not exist.

- [ ] **Step 3: Implement LLM client**

```ts
import type { AppConfig } from './config.js'

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: ChatRole
  content: string
  tool_call_id?: string
  tool_calls?: ModelToolCall[]
}

export interface ModelToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface CallModelInput {
  config: AppConfig
  messages: ChatMessage[]
  tools: unknown[]
}

export interface ModelResponse {
  content: string
  toolCalls: ModelToolCall[]
}

export async function callModel(input: CallModelInput): Promise<ModelResponse> {
  const response = await fetch(`${input.config.model.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: input.config.model.model,
      temperature: input.config.model.temperature,
      messages: input.messages,
      tools: input.tools,
      tool_choice: 'auto'
    })
  })

  if (!response.ok) {
    throw new Error(`Model request failed with HTTP ${response.status}: ${await response.text()}`)
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string | null
        tool_calls?: ModelToolCall[]
      }
    }>
  }

  const message = data.choices?.[0]?.message
  return {
    content: message?.content ?? '',
    toolCalls: message?.tool_calls ?? []
  }
}
```

- [ ] **Step 4: Verify LLM client**

Run: `npm test -- tests/llm-client.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit LLM client**

```bash
git add src/llm-client.ts tests/llm-client.test.ts
git commit -m "feat: add openai compatible llm client"
```

---

### Task 9: Context Builder And System Prompt

**Principle:** The model should receive stable instructions first, then recent conversation. A compact fixed prefix improves local model behavior and keeps token usage predictable.

**Files:**
- Create: `/Users/phoenix/Assistant/CC_based_Agent/src/context.ts`
- Create: `/Users/phoenix/Assistant/CC_based_Agent/src/prompts/system.md`
- Test: `/Users/phoenix/Assistant/CC_based_Agent/tests/context.test.ts`

- [ ] **Step 1: Write context tests**

```ts
import { describe, expect, it } from 'vitest'
import { buildInitialMessages, compactToolResult } from '../src/context.js'

describe('buildInitialMessages', () => {
  it('places system prompt before user content', () => {
    const messages = buildInitialMessages('system rules', 'read package.json')

    expect(messages).toEqual([
      { role: 'system', content: 'system rules' },
      { role: 'user', content: 'read package.json' }
    ])
  })
})

describe('compactToolResult', () => {
  it('keeps short output unchanged', () => {
    expect(compactToolResult('a\nb', 5)).toBe('a\nb')
  })

  it('compacts long output with head and tail context', () => {
    const output = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join('\n')
    const compacted = compactToolResult(output, 10)

    expect(compacted).toContain('line 1')
    expect(compacted).toContain('[tool output compacted]')
    expect(compacted).toContain('line 20')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/context.test.ts`

Expected: FAIL because context builder does not exist.

- [ ] **Step 3: Create system prompt**

```md
You are cc-local, a local Claude Code-style coding agent.

<critical>
Use tools when you need file content, project search, shell output, or user clarification.
Do not edit a file before reading it in this session.
Prefer the smallest change that satisfies the user request.
Explain final results clearly and include verification commands.
</critical>

Available workflow:
1. Understand the user request.
2. Read or search before modifying files.
3. Execute one tool call at a time.
4. After tool results, decide the next smallest useful action.
5. Stop when the task is complete and summarize what changed.
```

- [ ] **Step 4: Implement context builder**

```ts
import type { ChatMessage } from './llm-client.js'

export function buildInitialMessages(systemPrompt: string, userPrompt: string): ChatMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]
}

export function compactToolResult(content: string, maxLines: number): string {
  const lines = content.split(/\r?\n/)
  if (lines.length <= maxLines) {
    return content
  }

  const headCount = Math.max(1, Math.floor(maxLines * 0.6))
  const tailCount = Math.max(1, maxLines - headCount - 1)
  return [
    ...lines.slice(0, headCount),
    `[tool output compacted: ${lines.length} lines total]`,
    ...lines.slice(-tailCount)
  ].join('\n')
}
```

- [ ] **Step 5: Verify context**

Run: `npm test -- tests/context.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit context**

```bash
git add src/context.ts src/prompts/system.md tests/context.test.ts
git commit -m "feat: add prompt and context builder"
```

---

### Task 10: Agent Loop

**Principle:** The core loop is simple: send messages to the model, execute requested tools, append tool results, repeat until the model returns text without tool calls. The loop cap prevents infinite tool-call cycles.

**Files:**
- Create: `/Users/phoenix/Assistant/CC_based_Agent/src/agent-loop.ts`
- Test: `/Users/phoenix/Assistant/CC_based_Agent/tests/agent-loop.test.ts`

- [ ] **Step 1: Write loop tests**

```ts
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { runAgentLoop } from '../src/agent-loop.js'
import { createDefaultConfig } from '../src/config.js'
import type { ModelResponse } from '../src/llm-client.js'
import type { Tool } from '../src/tools/types.js'

const echoTool: Tool<{ text: string }> = {
  name: 'echo',
  description: 'Echo text.',
  parameters: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false
  },
  schema: z.object({ text: z.string() }),
  isReadonly: true,
  isDestructive: false,
  isConcurrencySafe: false,
  needsUserInteraction: false,
  async execute(args) {
    return { ok: true, content: args.text }
  }
}

describe('runAgentLoop', () => {
  it('returns assistant text when no tool calls are requested', async () => {
    const result = await runAgentLoop({
      config: createDefaultConfig('/tmp/project'),
      systemPrompt: 'system',
      userPrompt: 'hello',
      tools: [],
      callModel: async (): Promise<ModelResponse> => ({ content: 'final answer', toolCalls: [] })
    })

    expect(result.finalText).toBe('final answer')
  })

  it('executes tool calls and feeds the result back to the model', async () => {
    let calls = 0
    const result = await runAgentLoop({
      config: createDefaultConfig('/tmp/project'),
      systemPrompt: 'system',
      userPrompt: 'echo',
      tools: [echoTool],
      callModel: async (): Promise<ModelResponse> => {
        calls += 1
        if (calls === 1) {
          return {
            content: '',
            toolCalls: [
              {
                id: 'call-1',
                type: 'function',
                function: { name: 'echo', arguments: '{"text":"tool output"}' }
              }
            ]
          }
        }
        return { content: 'done after tool', toolCalls: [] }
      }
    })

    expect(result.finalText).toBe('done after tool')
    expect(result.toolCallCount).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/agent-loop.test.ts`

Expected: FAIL because `agent-loop.ts` does not exist.

- [ ] **Step 3: Implement agent loop**

```ts
import { buildInitialMessages, compactToolResult } from './context.js'
import type { AppConfig } from './config.js'
import { callModel as defaultCallModel, type ChatMessage, type ModelResponse } from './llm-client.js'
import { executeToolCall, toolDefinitions } from './tools/index.js'
import type { Tool, ToolContext } from './tools/types.js'

export interface RunAgentLoopInput {
  config: AppConfig
  systemPrompt: string
  userPrompt: string
  tools: Tool<unknown>[]
  callModel?: (input: { config: AppConfig; messages: ChatMessage[]; tools: unknown[] }) => Promise<ModelResponse>
}

export interface RunAgentLoopResult {
  finalText: string
  toolCallCount: number
}

export async function runAgentLoop(input: RunAgentLoopInput): Promise<RunAgentLoopResult> {
  const messages = buildInitialMessages(input.systemPrompt, input.userPrompt)
  const callModel = input.callModel ?? defaultCallModel
  const context: ToolContext = {
    config: input.config,
    trackedFiles: new Set<string>()
  }
  let toolCallCount = 0

  while (toolCallCount < input.config.maxToolCallsPerTurn) {
    const response = await callModel({
      config: input.config,
      messages,
      tools: toolDefinitions(input.tools)
    })

    if (response.toolCalls.length === 0) {
      return { finalText: response.content, toolCallCount }
    }

    messages.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.toolCalls
    })

    for (const toolCall of response.toolCalls) {
      toolCallCount += 1
      const result = await executeToolCall(
        {
          id: toolCall.id,
          name: toolCall.function.name,
          argumentsText: toolCall.function.arguments
        },
        input.tools,
        context
      )

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: compactToolResult(result.content, 120)
      })

      if (toolCallCount >= input.config.maxToolCallsPerTurn) {
        break
      }
    }
  }

  return {
    finalText: `Stopped after ${input.config.maxToolCallsPerTurn} tool calls to avoid an infinite loop.`,
    toolCallCount
  }
}
```

- [ ] **Step 4: Verify agent loop**

Run: `npm test -- tests/agent-loop.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit agent loop**

```bash
git add src/agent-loop.ts tests/agent-loop.test.ts
git commit -m "feat: add minimal agent loop"
```

---

### Task 11: CLI Wiring And Tool Set

**Principle:** The CLI should be thin. It gathers user input, loads the prompt, builds config, registers tools, and prints the loop result.

**Files:**
- Create: `/Users/phoenix/Assistant/CC_based_Agent/src/main.ts`
- Modify: `/Users/phoenix/Assistant/CC_based_Agent/src/tools/index.ts`
- Test: `/Users/phoenix/Assistant/CC_based_Agent/tests/tool-list.test.ts`

- [ ] **Step 1: Write tool-list test**

```ts
import { describe, expect, it } from 'vitest'
import { createCoreTools } from '../src/tools/index.js'

describe('createCoreTools', () => {
  it('registers the v1 tool set with no sub-agent tool', () => {
    const names = createCoreTools().map((tool) => tool.name)

    expect(names).toEqual([
      'bash',
      'file_read',
      'file_write',
      'file_edit',
      'grep',
      'glob',
      'ask_user'
    ])
    expect(names).not.toContain('task')
    expect(names.length).toBeLessThanOrEqual(8)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tool-list.test.ts`

Expected: FAIL because `createCoreTools` is not implemented.

- [ ] **Step 3: Extend tool registry exports**

Replace `/Users/phoenix/Assistant/CC_based_Agent/src/tools/index.ts` with:

```ts
import { askUserTool } from './ask-user.js'
import { bashTool } from './bash.js'
import { fileEditTool } from './file-edit.js'
import { fileReadTool } from './file-read.js'
import { fileWriteTool } from './file-write.js'
import { globTool } from './glob.js'
import { grepTool } from './grep.js'
import type { Tool, ToolCall, ToolContext, ToolResult } from './types.js'

export function createCoreTools(): Tool<unknown>[] {
  return [
    bashTool,
    fileReadTool,
    fileWriteTool,
    fileEditTool,
    grepTool,
    globTool,
    askUserTool
  ] as Tool<unknown>[]
}

export function toolDefinitions(tools: Tool<unknown>[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }))
}

export async function executeToolCall(
  call: ToolCall,
  tools: Tool<unknown>[],
  context: ToolContext
): Promise<ToolResult> {
  const tool = tools.find((candidate) => candidate.name === call.name)
  if (!tool) {
    return { ok: false, content: `Unknown tool: ${call.name}` }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(call.argumentsText)
  } catch {
    return { ok: false, content: `Invalid JSON arguments for tool ${call.name}` }
  }

  const validation = tool.schema.safeParse(parsed)
  if (!validation.success) {
    return {
      ok: false,
      content: `Invalid arguments for tool ${call.name}: ${validation.error.message}`
    }
  }

  try {
    return await tool.execute(validation.data, context)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, content: `Tool ${call.name} failed: ${message}` }
  }
}
```

- [ ] **Step 4: Implement CLI**

```ts
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import { Command } from 'commander'
import { runAgentLoop } from './agent-loop.js'
import { createDefaultConfig } from './config.js'
import { createCoreTools } from './tools/index.js'

const program = new Command()

program
  .name('cc-local')
  .description('Local Claude Code-style agent powered by an OpenAI-compatible MLX server.')
  .argument('<prompt...>', 'task for the agent')
  .option('--cwd <path>', 'working directory', process.cwd())

program.parse()

const options = program.opts<{ cwd: string }>()
const prompt = program.args.join(' ').trim()
if (!prompt) {
  console.error('Prompt cannot be empty.')
  process.exit(1)
}

const currentFile = fileURLToPath(import.meta.url)
const systemPromptPath = resolve(dirname(currentFile), 'prompts/system.md')
const systemPrompt = await readFile(systemPromptPath, 'utf8')
const config = createDefaultConfig(resolve(options.cwd))
const tools = createCoreTools()

const result = await runAgentLoop({
  config,
  systemPrompt,
  userPrompt: prompt,
  tools
})

console.log(chalk.green(result.finalText))
if (result.toolCallCount > 0) {
  console.log(chalk.dim(`tool calls: ${result.toolCallCount}`))
}
```

- [ ] **Step 5: Verify CLI wiring**

Run: `npm test -- tests/tool-list.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit CLI wiring**

```bash
git add src/main.ts src/tools/index.ts tests/tool-list.test.ts
git commit -m "feat: wire cli to core tools"
```

---

### Task 12: MLX Server Script

**Principle:** Keep inference outside the TypeScript process. The server script is the only Python/MLX-specific part, which makes the agent portable to other OpenAI-compatible local servers later.

**Files:**
- Create: `/Users/phoenix/Assistant/CC_based_Agent/server/start.sh`

- [ ] **Step 1: Create server launcher**

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_PATH="${ROOT_DIR}/Qwen3.5-9B-MLX-4bit"

python -m mlx_lm serve \
  --model "${MODEL_PATH}" \
  --host 127.0.0.1 \
  --port 8080
```

- [ ] **Step 2: Make script executable**

Run: `chmod +x server/start.sh`

Expected: command exits with code 0.

- [ ] **Step 3: Verify script syntax**

Run: `bash -n server/start.sh`

Expected: PASS with no output.

- [ ] **Step 4: Commit server script**

```bash
git add server/start.sh
git commit -m "feat: add mlx server launcher"
```

---

### Task 13: From-Zero Learning Guide

**Principle:** The project is meant for learning, not only running. The guide should explain why each component exists before showing how to run it.

**Files:**
- Create: `/Users/phoenix/Assistant/CC_based_Agent/docs/cc-local-from-zero.md`

- [ ] **Step 1: Create learning guide**

```md
# cc-local 从 0 构建指南

## 1. 这个项目在做什么

cc-local 不是训练一个新模型，而是把本地大模型包装成一个 Claude Code 风格的 coding agent。

核心思想：

1. 本地模型负责推理和选择工具。
2. TypeScript 程序负责执行工具、校验参数、控制安全边界。
3. 工具结果回填给模型，模型继续决定下一步。
4. 没有工具调用时，模型输出最终回答。

## 2. 为什么分成 TypeScript Agent 和 Python MLX Server

Python/MLX 适合 Apple Silicon 本地推理；TypeScript 适合实现 CLI、工具系统、文件操作和工程化测试。

两者通过 OpenAI-compatible HTTP API 解耦：

```text
用户输入
  -> TypeScript Agent Loop
  -> POST http://127.0.0.1:8080/v1/chat/completions
  -> MLX/Qwen 模型
  -> tool_calls 或 assistant text
  -> TypeScript 执行工具
  -> 工具结果回填给模型
```

## 3. Agent Loop 原理

Agent Loop 是一个受控 while 循环：

1. 组装 system prompt 和用户输入。
2. 调用模型。
3. 如果模型返回 tool_calls，就验证参数并执行工具。
4. 把工具结果作为 tool message 加回 messages。
5. 继续调用模型。
6. 如果模型返回普通文本，就结束。
7. 如果工具调用超过上限，就停止，避免死循环。

## 4. Tool Calling 原理

模型不会直接读写文件。模型只会返回类似这样的结构：

```json
{
  "name": "file_read",
  "arguments": "{\"file_path\":\"package.json\"}"
}
```

程序收到后做四件事：

1. 找到同名工具。
2. 把 JSON 参数解析成对象。
3. 用 Zod 校验参数类型。
4. 执行工具并返回结构化结果。

## 5. 为什么必须 Read-before-Edit

小模型容易凭记忆猜文件内容。强制先读再改可以避免它对未知文件做错误替换。

实现方式：

1. `file_read` 成功后把真实路径加入 `trackedFiles`。
2. `file_edit` 执行前检查 `trackedFiles.has(path)`。
3. 没有读过就拒绝编辑。

## 6. 为什么 v1 不做 Sub-Agent

`knowledge/README.md` 的本地模型实测显示 9B 模型没有稳定的任务委派能力。v1 保留核心工具，不暴露 task/sub-agent 工具。

## 7. 运行方式

先启动模型：

```bash
./server/start.sh
```

另开一个终端运行 agent：

```bash
npm run dev -- "read package.json"
```

验证代码：

```bash
npm test
npm run typecheck
```

## 8. 下一步学习顺序

1. 读 `src/tools/types.ts`：理解工具接口。
2. 读 `src/tools/index.ts`：理解工具注册和执行。
3. 读 `src/llm-client.ts`：理解 OpenAI-compatible 请求。
4. 读 `src/agent-loop.ts`：理解循环控制。
5. 读 `src/tools/file-edit.ts`：理解 read-before-edit 安全约束。
```

- [ ] **Step 2: Verify guide is present**

Run: `test -f docs/cc-local-from-zero.md`

Expected: command exits with code 0.

- [ ] **Step 3: Commit guide**

```bash
git add docs/cc-local-from-zero.md
git commit -m "docs: explain cc-local from zero"
```

---

### Task 14: End-To-End Verification

**Principle:** Unit tests prove components; an end-to-end smoke test proves the pieces are wired together. Because the model call depends on a running local server, keep the automated smoke test limited to syntax, test suite, and typecheck; perform model interaction manually after starting MLX.

**Files:**
- Modify: no source changes expected

- [ ] **Step 1: Run full unit test suite**

Run: `npm test`

Expected: PASS for all TypeScript tests.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Verify server script syntax**

Run: `bash -n server/start.sh`

Expected: PASS with no output.

- [ ] **Step 4: Start local model server in a separate terminal**

Run: `./server/start.sh`

Expected: server logs show it is listening on `127.0.0.1:8080`.

- [ ] **Step 5: Run manual agent smoke test**

Run: `npm run dev -- "Read package.json and tell me the project name."`

Expected: the model calls `file_read`, then the final response says the project name is `cc-local`.

- [ ] **Step 6: Commit final verification notes if docs changed**

If Task 14 adds no files, skip this commit. If a verification note is added to `docs/cc-local-from-zero.md`, run:

```bash
git add docs/cc-local-from-zero.md
git commit -m "docs: record cc-local smoke test"
```

---

## Self-Review

- Spec coverage: The plan covers `knowledge/README.md` implementation direction: TS Agent + MLX server, 8-or-fewer tools, OpenAI-compatible tool calling, read-before-edit, deny-listed bash, simple context compaction, and no sub-agent in v1.
- Placeholder scan: No task uses deferred implementation language. Every code-writing step includes concrete content.
- Type consistency: Tool names are consistent across tests, registry, prompt, and docs: `bash`, `file_read`, `file_write`, `file_edit`, `grep`, `glob`, `ask_user`.

## Execution Choice

Plan complete and saved to `docs/superpowers/plans/2026-05-11-cc-local-agent-from-zero.md`. Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. Inline Execution - execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
