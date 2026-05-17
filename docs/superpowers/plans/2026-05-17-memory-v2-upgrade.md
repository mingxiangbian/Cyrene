# Memory System v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade memory into an automatic, scoped, capacity-managed pipeline: tool facts append to `daily.md`, daily facts can be compacted into durable memory files, and startup loads persona/rules/memory from both project and global scopes.

**Architecture:** Keep the existing project `.cc-local/memory/` format, add a global `.cc-local` root, and replace `CLAUDE.md` naming with `Rule.md`. The pipeline is deliberately staged: first add deterministic loading/writing primitives, then wire agent-loop logging, then add LLM-assisted daily compaction and REPL exit behavior.

**Tech Stack:** TypeScript, Node `fs/promises`, Vitest, existing `CallModelInput`/`ModelResponse`, existing `ToolResult` flow.

---

## Decisions And Scope

- `CLAUDE.md` is not used. Rule files are named `Rule.md`.
- Project rule path: `<project>/.cc-local/Rule.md`
- Global rule path: `~/.cc-local/Rule.md`
- Project memory dir: `<project>/.cc-local/memory/`
- Global memory dir: `~/.cc-local/memory/`
- Persona is global only. Global persona path: `~/.cc-local/soul.md`
- Existing `sessions/` files are not deleted. New startup no longer loads them after Task 8, but old files remain on disk.
- `daily.md` compaction must avoid duplicate promotion. After successful compaction, archive the compacted daily content to `daily.archive.md` and truncate `daily.md`.
- `MEMORY.md` index entries must point to real memory files. Any task that adds an index entry must also write the target memory file.
- Missing files are normal and return empty strings. Security errors such as symlink writes, non-file targets, or paths escaping the expected root must not be silently swallowed.
- Global scope IO failures caused by absence or permissions should degrade gracefully. Project scope security violations should fail loudly in direct memory helpers and be caught only at outer best-effort call sites.

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/config.ts` | Memory v2 config defaults and types |
| `src/memory.ts` | Memory path helpers, rule/persona/daily loaders, durable memory file/index writes, compaction helpers |
| `src/daily-logger.ts` | Pure regex extraction of tool facts and daily append wrapper |
| `src/agent-loop.ts` | Best-effort daily logging after each tool result |
| `src/repl.ts` | REPL graceful-exit daily compaction |
| `src/main.ts` | Startup system prompt assembly |
| `tests/memory-load.test.ts` | Path/load/write helper coverage |
| `tests/daily-logger.test.ts` | Pure extractor and append coverage |
| `tests/agent-loop.test.ts` | Daily logger wiring coverage |
| `tests/repl.test.ts` | Exit compaction coverage |
| `tests/main-cli.test.ts` | Startup prompt assembly coverage |
| `tests/memory-v2-integration.test.ts` | End-to-end lifecycle coverage |

---

## Task 1: Config Fields

**Files:**
- Modify: `src/config.ts`
- Modify: `tests/config.test.ts`

- [ ] **Step 1: Add failing defaults test**

Add assertions to the existing default config test:

```ts
expect(config.userCcLocalDir).toBe(join(homedir(), '.cc-local'))
expect(config.dailyCompactThreshold).toBe(500)
expect(config.dailyLoadLines).toBe(200)
expect(config.memoryMaxLines).toBe(200)
expect(config.memoryMaxLineLength).toBe(150)
```

Use `node:os` `homedir` and `node:path` `join`.

- [ ] **Step 2: Run failing test**

Run: `npx vitest run tests/config.test.ts`

Expected: fail because `userCcLocalDir` and the memory v2 config fields do not exist.

- [ ] **Step 3: Implement config fields**

Add to `AppConfig`:

```ts
userCcLocalDir: string
dailyCompactThreshold: number
dailyLoadLines: number
memoryMaxLines: number
memoryMaxLineLength: number
```

Add defaults in `createDefaultConfig(cwd)`:

```ts
userCcLocalDir: join(homedir(), '.cc-local'),
dailyCompactThreshold: 500,
dailyLoadLines: 200,
memoryMaxLines: 200,
memoryMaxLineLength: 150,
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
npx vitest run tests/config.test.ts
npx tsc --noEmit
git add src/config.ts tests/config.test.ts
git commit -m "feat: add memory v2 config fields"
```

---

## Task 2: Rule And Persona Loaders

**Files:**
- Modify: `src/memory.ts`
- Modify: `tests/memory-load.test.ts`

- [ ] **Step 1: Add failing tests**

Add tests for:

- `loadSoul(userCcLocalDir)` loads global `soul.md`, with heading `## Global Persona`.
- Missing `soul.md` returns `''`.
- `loadRuleStack(cwd, userCcLocalDir)` loads `~/.cc-local/Rule.md` plus each `<dir>/.cc-local/Rule.md` from home toward cwd.
- Missing `Rule.md` at an intermediate directory is skipped, not a stop condition.
- Paths outside home are not traversed for upward rule loading.
- Empty files are ignored.

Run: `npx vitest run tests/memory-load.test.ts`

Expected: fail because `loadSoul` and `loadRuleStack` do not exist.

- [ ] **Step 2: Implement minimal loaders**

Add exports:

```ts
export async function loadSoul(userCcLocalDir: string): Promise<string>
export async function loadRuleStack(cwd: string, userCcLocalDir: string): Promise<string>
```

Rules:

- Use only global `.cc-local/soul.md`, not project `.cc-local/soul.md` and not `memory/soul.md`.
- Use `.cc-local/Rule.md`, not `CLAUDE.md`.
- Load global first, then project/local rules from broader to narrower directories.
- Missing files return no section.
- Do not follow symlink files for rule/persona loads.

- [ ] **Step 3: Verify and commit**

Run:

```bash
npx vitest run tests/memory-load.test.ts
npx tsc --noEmit
git add src/memory.ts tests/memory-load.test.ts
git commit -m "feat: load soul and rule memory layers"
```

---

## Task 3: Daily Logger Primitives

**Files:**
- Create: `src/daily-logger.ts`
- Create: `tests/daily-logger.test.ts`

- [ ] **Step 1: Add failing extractor tests**

Cover:

- `bash` with result `ok: true` records command summary and success.
- `bash` with `ok: false` records command summary and failure.
- `file_edit` records target path from args.
- `file_write` records target path from args.
- `file_read` records target path from args.
- `web_search` records query and status.
- `ask_user` returns `null`.
- Unknown tools record `{toolName} ok` or `{toolName} failed`.

Run: `npx vitest run tests/daily-logger.test.ts`

Expected: fail because `src/daily-logger.ts` does not exist.

- [ ] **Step 2: Implement pure extraction**

Export:

```ts
export interface ToolFactInput {
  toolName: string
  argumentsText: string
  ok: boolean
  content: string
  now?: Date
}

export function extractFactFromToolCall(input: ToolFactInput): string | null
```

Output format:

```text
[HH:MM] tool_name -> summary
```

Use ASCII `->`, not Unicode arrows, to match repo style.

- [ ] **Step 3: Add append tests**

Cover:

- Creates `<cwd>/.cc-local/memory/`.
- Appends to `<cwd>/.cc-local/memory/daily.md`.
- Does not overwrite existing content.
- Empty chunks do nothing.
- Refuses symlinked `daily.md`.

- [ ] **Step 4: Implement append**

Export:

```ts
export async function appendDaily(cwd: string, chunks: string[]): Promise<void>
```

Use the existing memory write safety style from `src/memory.ts`: create directories under the project, do not write through symlinks, and append with `O_APPEND | O_CREAT | O_NOFOLLOW` or the existing helper if it is made shared.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npx vitest run tests/daily-logger.test.ts
npx tsc --noEmit
git add src/daily-logger.ts tests/daily-logger.test.ts
git commit -m "feat: add regex daily logger"
```

---

## Task 4: Daily And Scoped Memory Loading

**Files:**
- Modify: `src/memory.ts`
- Modify: `tests/memory-load.test.ts`

- [ ] **Step 1: Add failing tests**

Cover:

- `loadDaily(cwd, 2)` returns the last two lines from project `daily.md`.
- `loadDaily(cwd, 0)` returns `''`.
- Missing `daily.md` returns `''`.
- `loadMemoryScope(projectMemoryDir, 'Project Memory')` loads linked files from `MEMORY.md`.
- `loadMemoryScope(globalMemoryDir, 'Global Memory')` loads linked files from global memory dir.
- A missing global memory dir returns `''`.
- Missing linked files are skipped.

- [ ] **Step 2: Implement explicit APIs**

Do not overload `loadMemories(cwd, userMemoryDir?)` ambiguously. Add:

```ts
export async function loadDaily(cwd: string, lines: number): Promise<string>
export async function loadMemoryScope(memoryDir: string, heading: string): Promise<string>
export async function loadProjectMemories(cwd: string): Promise<string>
export async function loadGlobalMemories(userCcLocalDir: string): Promise<string>
```

Keep existing `loadMemories(cwd)` as a backward-compatible alias for project memories until `main.ts` is migrated.

- [ ] **Step 3: Verify and commit**

Run:

```bash
npx vitest run tests/memory-load.test.ts
npx tsc --noEmit
git add src/memory.ts tests/memory-load.test.ts
git commit -m "feat: add daily and scoped memory loading"
```

---

## Task 5: Agent Loop Daily Logging

**Files:**
- Modify: `src/agent-loop.ts`
- Modify: `tests/agent-loop.test.ts`

- [ ] **Step 1: Add failing tests**

Add an injectable logger to `RunAgentLoopBaseInput`:

```ts
dailyLogger?: {
  appendDaily: (cwd: string, chunks: string[]) => Promise<void>
}
```

Tests:

- After a successful tool call, logger receives one fact.
- After a failing tool call, logger receives one failure fact.
- Logger failure does not prevent final model response.
- No logger means no filesystem write attempt in tests.

- [ ] **Step 2: Implement logging**

Inside the tool execution loop, call `extractFactFromToolCall` after `result` is available and before/after pushing the tool message. Collect facts in an array for that loop iteration, then call:

```ts
await (input.dailyLogger?.appendDaily ?? appendDaily)(input.config.cwd, facts)
```

Wrap only the append in `try/catch`; do not swallow tool execution errors.

- [ ] **Step 3: Verify and commit**

Run:

```bash
npx vitest run tests/agent-loop.test.ts tests/daily-logger.test.ts
npx tsc --noEmit
git add src/agent-loop.ts tests/agent-loop.test.ts
git commit -m "feat: log daily memory after tool calls"
```

---

## Task 6: Durable Memory Writes And Capacity

**Files:**
- Modify: `src/memory.ts`
- Modify: `tests/memory-load.test.ts`

- [ ] **Step 1: Add failing tests**

Cover:

- `writeMemoryEntry` creates `memory/<slug>.md` and appends matching `MEMORY.md` index line.
- Existing index line count `>= memoryMaxLines` returns `{ ok: false, error: 'MEMORY.md is full' }`.
- Summary longer than `memoryMaxLineLength` returns an error; do not silently truncate.
- Entry title/file/summary cannot contain newlines.
- Memory file writes refuse symlink targets.

- [ ] **Step 2: Implement write API**

Add:

```ts
export interface MemoryWriteLimits {
  memoryMaxLines: number
  memoryMaxLineLength: number
}

export type MemoryWriteResult =
  | { ok: true; file: string }
  | { ok: false; error: string }

export async function writeMemoryEntry(
  cwd: string,
  entry: { title: string; file: string; summary: string; content: string },
  limits: MemoryWriteLimits
): Promise<MemoryWriteResult>
```

`writeMemoryEntry` must write the actual memory file and then append the index line. Keep `updateMemoryIndex` only as a thin compatibility wrapper if needed.

- [ ] **Step 3: Verify and commit**

Run:

```bash
npx vitest run tests/memory-load.test.ts
npx tsc --noEmit
git add src/memory.ts tests/memory-load.test.ts
git commit -m "feat: add durable memory writes with capacity limits"
```

---

## Task 7: Compact Daily Into Durable Memories

**Files:**
- Modify: `src/memory.ts`
- Modify: `tests/memory-load.test.ts`

- [ ] **Step 1: Add failing tests**

Cover:

- `compactMemories` calls injected `callModel` with a structured editing prompt.
- Mock model JSON response with entries writes memory files and index lines.
- Invalid model JSON returns `{ ok: false }`.
- Duplicate file names are rejected or made unique deterministically.
- Successful compaction archives daily content to `daily.archive.md` and truncates `daily.md`.
- Failed compaction leaves `daily.md` unchanged.

- [ ] **Step 2: Implement compaction**

Add:

```ts
export interface CompactMemoriesInput {
  cwd: string
  dailyContent: string
  config: AppConfig
  callModel: (input: CallModelInput) => Promise<ModelResponse>
}

export type CompactMemoriesResult =
  | { ok: true; promoted: number }
  | { ok: false; error: string }

export async function compactMemories(input: CompactMemoriesInput): Promise<CompactMemoriesResult>
```

Model output format must be JSON:

```json
{
  "entries": [
    {
      "title": "Short title",
      "file": "short-title.md",
      "summary": "One-line summary",
      "content": "Durable memory content"
    }
  ]
}
```

Only archive/truncate daily after every entry is written successfully.

- [ ] **Step 3: Verify and commit**

Run:

```bash
npx vitest run tests/memory-load.test.ts
npx tsc --noEmit
git add src/memory.ts tests/memory-load.test.ts
git commit -m "feat: compact daily memory into durable entries"
```

---

## Task 8: REPL Exit Daily Compaction

**Files:**
- Modify: `src/repl.ts`
- Modify: `tests/repl.test.ts`

- [ ] **Step 1: Add failing tests**

Cover:

- On graceful exit, daily line count `>= dailyCompactThreshold` calls `compactMemories`.
- Below threshold skips compaction.
- Compaction failure does not prevent exit.
- Existing `saveSessionSummary` flow is removed from REPL exit.
- Existing `sessions/` files are not deleted.

- [ ] **Step 2: Implement exit flow**

On graceful exit:

1. Read project daily via `loadDaily(config.cwd, Number.MAX_SAFE_INTEGER)`.
2. Count non-empty lines.
3. If below threshold, return.
4. Call injected or default `compactMemories`.
5. Catch compaction errors at this boundary.

Keep a test injection point, for example:

```ts
compactMemories?: typeof defaultCompactMemories
```

- [ ] **Step 3: Verify and commit**

Run:

```bash
npx vitest run tests/repl.test.ts tests/memory-load.test.ts
npx tsc --noEmit
git add src/repl.ts tests/repl.test.ts
git commit -m "feat: compact daily memory on repl exit"
```

---

## Task 9: Startup Memory Stack

**Files:**
- Modify: `src/main.ts`
- Modify: `tests/main-cli.test.ts`

- [ ] **Step 1: Add failing prompt assembly test**

Expected order:

```text
base system prompt
current date
global persona
global Rule.md
parent project Rule.md
current project Rule.md
project instructions.md
project memories
global memories
project daily recent lines
```

No `loadRecentSummaries` content should be included after this task.

- [ ] **Step 2: Implement startup assembly**

Use:

```ts
const persona = await loadSoul(config.userCcLocalDir)
const rules = await loadRuleStack(config.cwd, config.userCcLocalDir)
const projectInstructions = await loadInstructionsIfExists(config.cwd)
const projectMemories = await loadProjectMemories(config.cwd)
const globalMemories = await loadGlobalMemories(config.userCcLocalDir)
const daily = await loadDaily(config.cwd, config.dailyLoadLines)
```

Join non-empty sections in the test order above.

- [ ] **Step 3: Verify and commit**

Run:

```bash
npx vitest run tests/main-cli.test.ts tests/memory-load.test.ts
npx tsc --noEmit
git add src/main.ts tests/main-cli.test.ts
git commit -m "feat: assemble memory v2 stack on startup"
```

---

## Task 10: End-To-End Lifecycle Test

**Files:**
- Create: `tests/memory-v2-integration.test.ts`

- [ ] **Step 1: Add integration tests**

Cover:

- Tool call appends project `daily.md`.
- Startup loads project daily recent lines.
- REPL graceful exit over threshold promotes daily into a real memory file and `MEMORY.md` index entry.
- After promotion, project `daily.md` is empty and `daily.archive.md` contains archived facts.
- Global memory and project memory both appear in startup prompt without duplication.

- [ ] **Step 2: Run and fix only integration gaps**

Run:

```bash
npx vitest run tests/memory-v2-integration.test.ts
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add tests/memory-v2-integration.test.ts
git commit -m "test: add memory v2 lifecycle integration coverage"
```

---

## Task 11: Final Verification

- [ ] Run targeted memory tests:

```bash
npx vitest run tests/config.test.ts tests/daily-logger.test.ts tests/memory-load.test.ts tests/agent-loop.test.ts tests/repl.test.ts tests/main-cli.test.ts tests/memory-v2-integration.test.ts
```

- [ ] Run full verification:

```bash
npx vitest run
npx tsc --noEmit
git status --short
```

- [ ] Manual smoke test:

```bash
npm run dev -- --repl
```

In REPL:

```text
use bash to echo hello
exit
```

Expected:

- `<cwd>/.cc-local/memory/daily.md` is created.
- It contains at least one `[HH:MM] bash -> ...` line before compaction threshold is reached.
- If the threshold is lowered for the smoke test, compaction creates/updates `MEMORY.md`, creates a linked memory file, archives daily content, and truncates `daily.md`.

---

## Risk Checklist Before Execution

- Do not touch unrelated current worktree changes.
- Do not delete existing `sessions/` files.
- Do not use `CLAUDE.md`.
- Do not add project-level `soul.md`; persona is global-only.
- Do not silently swallow memory path security errors inside low-level helpers.
- Do not add index entries without writing their target memory files.
- Do not compact the same `daily.md` content repeatedly.
