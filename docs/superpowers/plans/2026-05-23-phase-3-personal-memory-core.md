# Phase 3 Personal Memory Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 spec 实现 `Controlled Automatic Personal Memory Core`，让 `.cyrene/memory/index.jsonl` 成为 active memory source of truth，并删除 runtime daily memory 路径。

**Architecture:** 第一版采用单一 typed JSONL store，通过 `domain` 和 `strength` 做逻辑隔离；`LLM` 只生成 candidates，deterministic validator/lifecycle 决定写入、pending、reject、archive。Runtime 在 CLI/Web/REPL trace finalize 后 best-effort 执行 memory pipeline，prompt 注入只读取 active typed memory retrieval。

**Tech Stack:** TypeScript ESM, Node.js `fs/promises`, Vitest, Commander CLI, existing `RunRecorder` trace store, existing `memory_extraction` model route.

---

## Baseline

已在 `codex/phase-3-personal-memory-core` 分支执行：

```bash
npm test
npm run typecheck
```

当前基线：`37` 个 test files、`367` 个 tests 通过，typecheck 退出 `0`。

## 文件结构

新增：

- `src/memory/types.ts`：Personal Memory Core 类型。
- `src/memory/paths.ts`：安全解析 `.cyrene/memory` 路径，拒绝 symlink/path traversal。
- `src/memory/memory-store.ts`：JSONL store 读写、atomic rewrite、pending merge、events append。
- `src/memory/memory-exporter.ts`：生成 `projections/*.md` 和 transition compatibility `MEMORY.md`。
- `src/memory/memory-retriever.ts`：按 `query/domain/type/strength/scope/task` 检索 active memory。
- `src/memory/memory-validator.ts`：deterministic policy、affective guard、tombstone guard。
- `src/memory/memory-lifecycle.ts`：执行 decisions、promote/pending/reject/archive/prune。
- `src/memory/memory-candidate-extractor.ts`：构造 extraction prompt、解析 candidate JSON。
- `src/memory/memory-runtime.ts`：CLI/Web/REPL 共用的 post-run best-effort memory pipeline。
- `src/memory/memory-snapshot.ts`：snapshot create/list/restore。
- `src/memory/memory-migration.ts`：legacy `MEMORY.md`、topic files、`daily.md`、`sessions/` migration + cleanup。
- `tests/personal-memory-store.test.ts`
- `tests/personal-memory-validator.test.ts`
- `tests/personal-memory-retriever.test.ts`
- `tests/personal-memory-migration.test.ts`
- `tests/personal-memory-runtime.test.ts`

修改：

- `src/config.ts`：新增 memory limits 和 `memoryAutoExtractEnabled`。
- `src/memory.ts`：保留 persona/rule helpers；runtime memory 读取改委托 typed retriever；legacy write/compaction 仅保留 migration/test 兼容或移除 runtime 依赖。
- `src/web/prompt-context.ts`：移除 `loadDaily` 注入，改用 typed retrieval。
- `src/agent-loop.ts`：移除 `maybeAppendDailySummary` hook。
- `src/main.ts`：新增 `cyrene memory ...` commands；one-shot trace finalize 后调用 `processRunMemory`；移除 `compactDailyIfNeeded`。
- `src/repl.ts`：每 turn finalize 后调用 `processRunMemory`；graceful exit 不再 compact daily。
- `src/web/server.ts`：Web run finalize 后调用 `processRunMemory`；移除 `compactDailyIfNeeded` 注入。
- `scripts/setup-local-state.mjs`：不再创建 `daily.md`，创建 typed memory skeleton。
- 相关 tests：把 old daily expectations 改成 typed memory expectations；删除或改写 daily compaction runtime tests。

---

### Task 1: Typed Store Foundation

**Files:**
- Create: `src/memory/types.ts`
- Create: `src/memory/paths.ts`
- Create: `src/memory/memory-store.ts`
- Test: `tests/personal-memory-store.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `tests/personal-memory-store.test.ts` with tests for:

```ts
it('writes and reads active memories from index.jsonl')
it('merges pending candidates by normalizedKey')
it('appends lifecycle events')
it('refuses to write through a symlinked memory directory')
```

Run:

```bash
npm test -- tests/personal-memory-store.test.ts
```

Expected: fails because `src/memory/memory-store.ts` does not exist.

- [ ] **Step 2: Add core types**

Implement `MemoryDomain`, `MemoryType`, `MemoryStrength`, `MemoryScope`, `MemoryScores`, `CyreneMemory`, `PendingMemory`, `MemoryTombstone`, `MemoryEvent`, `MemoryDecision`, and helper defaults in `src/memory/types.ts`.

- [ ] **Step 3: Add safe paths**

Implement `getMemoryRoot(cwd)`, `getReadableMemoryRoot(cwd)`, `ensureMemoryRoot(cwd)`, `resolveMemoryFile(root, relativePath)`, and `assertSafeMemoryRoot(root)` in `src/memory/paths.ts`.

- [ ] **Step 4: Add JSONL store**

Implement in `src/memory/memory-store.ts`:

```ts
readActiveMemories(cwd: string): Promise<CyreneMemory[]>
writeActiveMemories(cwd: string, memories: CyreneMemory[]): Promise<void>
readPendingMemories(cwd: string): Promise<PendingMemory[]>
upsertPendingMemory(cwd: string, candidate: PendingMemory): Promise<PendingMemory>
appendMemoryEvent(cwd: string, event: MemoryEvent): Promise<void>
readMemoryEvents(cwd: string, limit?: number): Promise<MemoryEvent[]>
readTombstones(cwd: string): Promise<MemoryTombstone[]>
appendTombstone(cwd: string, tombstone: MemoryTombstone): Promise<void>
```

`upsertPendingMemory` must merge same `normalizedKey` by updating `seenCount`, `lastSeenAt`, bounded `evidence`, and averaged scores.

- [ ] **Step 5: Verify Task 1**

Run:

```bash
npm test -- tests/personal-memory-store.test.ts
npm run typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/memory/types.ts src/memory/paths.ts src/memory/memory-store.ts tests/personal-memory-store.test.ts
git commit -m "feat: add personal memory typed store"
```

---

### Task 2: Projection And Retrieval

**Files:**
- Create: `src/memory/memory-exporter.ts`
- Create: `src/memory/memory-retriever.ts`
- Test: `tests/personal-memory-retriever.test.ts`

- [ ] **Step 1: Write failing projection/retrieval tests**

Create tests for:

```ts
it('renders projections from active low-sensitivity memories only')
it('redacts affective projection output')
it('retrieves coding memories from project/procedural/system domains')
it('retrieves conversation memories without surfacing high-sensitivity affective content')
it('respects maxItems and maxTokens')
```

Run:

```bash
npm test -- tests/personal-memory-retriever.test.ts
```

Expected: fails because exporter/retriever do not exist.

- [ ] **Step 2: Add projection renderer**

Implement:

```ts
renderMemoryProjections(cwd: string): Promise<void>
formatMemoryProjection(memories: CyreneMemory[], kind: 'overall' | 'project' | 'personal' | 'affect'): string
```

Outputs:

```txt
.cyrene/memory/projections/MEMORY.md
.cyrene/memory/projections/PROJECT.md
.cyrene/memory/projections/PERSONAL.md
.cyrene/memory/projections/AFFECT.md
.cyrene/memory/MEMORY.md
```

All files include generated header. `AFFECT.md` must omit entries with `scores.safety < 0.9` or `scores.sensitivity > 0.3`.

- [ ] **Step 3: Add deterministic retriever**

Implement:

```ts
retrieveMemories(input: RetrieveMemoriesInput): Promise<RetrievedMemory[]>
formatMemoryContext(memories: RetrievedMemory[]): string
```

Ranking:

```txt
score = relevance * 0.35
  + usefulness * 0.25
  + evidenceStrength * 0.20
  + safety * 0.10
  + recency * 0.10
  - sensitivityPenalty
```

- [ ] **Step 4: Verify Task 2**

Run:

```bash
npm test -- tests/personal-memory-retriever.test.ts
npm run typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/memory/memory-exporter.ts src/memory/memory-retriever.ts tests/personal-memory-retriever.test.ts
git commit -m "feat: add personal memory projections and retrieval"
```

---

### Task 3: Validator And Lifecycle

**Files:**
- Create: `src/memory/memory-validator.ts`
- Create: `src/memory/memory-lifecycle.ts`
- Test: `tests/personal-memory-validator.test.ts`

- [ ] **Step 1: Write failing validator/lifecycle tests**

Create tests for:

```ts
it('auto-writes eligible project hard memory')
it('keeps implicit personal memory soft or pending')
it('rejects affective diagnostic claims')
it('blocks affective hard global auto-write')
it('requires expiresAt for session episode memory')
it('uses tombstones to reject repeated rejected candidates')
it('promotes repeated pending candidates when policy becomes eligible')
```

Run:

```bash
npm test -- tests/personal-memory-validator.test.ts
```

Expected: fails because validator/lifecycle do not exist.

- [ ] **Step 2: Add validator policy**

Implement:

```ts
validateMemoryCandidate(input: ValidateMemoryCandidateInput): MemoryDecision
```

Rules:

```txt
auto_write requires evidenceStrength >= 0.80, stability >= 0.70,
usefulness >= 0.60, safety >= 0.80, sensitivity <= 0.60.

pending requires evidenceStrength >= 0.55, usefulness >= 0.45,
safety >= 0.65.

affective hard/global auto_write is rejected in Phase 3.
diagnostic claims such as anxious, unstable, dependent are rejected.
```

- [ ] **Step 3: Add lifecycle executor**

Implement:

```ts
applyMemoryDecision(cwd: string, decision: MemoryDecision): Promise<ApplyMemoryDecisionResult>
processMemoryCandidate(input: ProcessMemoryCandidateInput): Promise<ApplyMemoryDecisionResult>
```

It must update active store, pending store, tombstones, events, and projections.

- [ ] **Step 4: Verify Task 3**

Run:

```bash
npm test -- tests/personal-memory-validator.test.ts
npm run typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/memory/memory-validator.ts src/memory/memory-lifecycle.ts tests/personal-memory-validator.test.ts
git commit -m "feat: add personal memory validation lifecycle"
```

---

### Task 4: Candidate Extraction And Runtime Pipeline

**Files:**
- Create: `src/memory/memory-candidate-extractor.ts`
- Create: `src/memory/memory-runtime.ts`
- Test: `tests/personal-memory-runtime.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Create tests for:

```ts
it('extracts candidates with domain strength and scores contract')
it('processes a successful run into active memory')
it('keeps extraction failure best-effort')
it('does nothing when memoryAutoExtractEnabled is false')
```

Run:

```bash
npm test -- tests/personal-memory-runtime.test.ts
```

Expected: fails because runtime pipeline does not exist.

- [ ] **Step 2: Add extractor prompt and parser**

Implement:

```ts
buildMemoryCandidatePrompt(input: BuildMemoryCandidatePromptInput): string
extractMemoryCandidates(input: ExtractMemoryCandidatesInput): Promise<PendingMemory[]>
parseMemoryCandidates(content: string, runId: string): PendingMemory[]
```

The prompt must require JSON only and include the affective/relationship guardrails from the spec.

- [ ] **Step 3: Add post-run runtime**

Implement:

```ts
processRunMemory(input: ProcessRunMemoryInput): Promise<ProcessRunMemoryResult>
```

It must call extractor, validator/lifecycle per candidate, return counts, and never throw unless called with invalid static input. Runtime call sites will catch it anyway.

- [ ] **Step 4: Verify Task 4**

Run:

```bash
npm test -- tests/personal-memory-runtime.test.ts
npm run typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/memory/memory-candidate-extractor.ts src/memory/memory-runtime.ts tests/personal-memory-runtime.test.ts
git commit -m "feat: add post-run personal memory pipeline"
```

---

### Task 5: Migration, Snapshots, And CLI Commands

**Files:**
- Create: `src/memory/memory-snapshot.ts`
- Create: `src/memory/memory-migration.ts`
- Modify: `src/main.ts`
- Test: `tests/personal-memory-migration.test.ts`
- Modify: `tests/main-cli.test.ts`

- [ ] **Step 1: Write failing migration/CLI tests**

Create tests for:

```ts
it('creates a snapshot before legacy migration')
it('migrates legacy MEMORY.md and topic files into index.jsonl')
it('deletes legacy topic files daily files and sessions after migration')
it('lists memory entries through cyrene memory list')
it('supports snapshot list and dry-run restore')
```

Run:

```bash
npm test -- tests/personal-memory-migration.test.ts tests/main-cli.test.ts
```

Expected: new tests fail because migration/snapshot/CLI commands do not exist.

- [ ] **Step 2: Add snapshot support**

Implement:

```ts
createMemorySnapshot(cwd: string, reason: string): Promise<MemorySnapshot>
listMemorySnapshots(cwd: string): Promise<MemorySnapshotSummary[]>
restoreMemorySnapshot(input: RestoreMemorySnapshotInput): Promise<RestoreMemorySnapshotResult>
```

Restore must create a protective snapshot unless `dryRun: true`.

- [ ] **Step 3: Add legacy migration**

Implement:

```ts
migrateLegacyMemory(cwd: string): Promise<MemoryMigrationResult>
```

It reads legacy `MEMORY.md`, linked topic files, non-empty `daily.md`, and `sessions/`; writes typed memories/events; renders projections; removes migrated legacy files.

- [ ] **Step 4: Add CLI memory commands**

Modify `src/main.ts` to support:

```bash
cyrene memory list
cyrene memory search <query>
cyrene memory inspect <id>
cyrene memory pending
cyrene memory events --limit 20
cyrene memory migrate
cyrene memory snapshot list
cyrene memory snapshot restore <snapshotId> --dry-run
cyrene memory snapshot restore <snapshotId>
```

- [ ] **Step 5: Verify Task 5**

Run:

```bash
npm test -- tests/personal-memory-migration.test.ts tests/main-cli.test.ts
npm run typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/memory/memory-snapshot.ts src/memory/memory-migration.ts src/main.ts tests/personal-memory-migration.test.ts tests/main-cli.test.ts
git commit -m "feat: add personal memory migration cli"
```

---

### Task 6: Runtime Integration And Daily Removal

**Files:**
- Modify: `src/agent-loop.ts`
- Modify: `src/main.ts`
- Modify: `src/repl.ts`
- Modify: `src/web/server.ts`
- Modify: `src/web/prompt-context.ts`
- Modify: `scripts/setup-local-state.mjs`
- Modify: `src/config.ts`
- Modify: `tests/agent-loop.test.ts`
- Modify: `tests/repl.test.ts`
- Modify: `tests/web-server.test.ts`
- Modify: `tests/web-prompt-context.test.ts`
- Modify: `tests/setup-local-state.test.ts`

- [ ] **Step 1: Write failing runtime integration tests**

Update tests to assert:

```ts
runAgentLoop no longer calls maybeAppendDailySummary
buildAgentRuntime does not load daily.md
CLI one-shot calls processRunMemory after recorder.finalize
Web run calls processRunMemory after recorder.finalize
REPL turn calls processRunMemory after recorder.finalize
setup-local-state does not create daily.md
```

Run:

```bash
npm test -- tests/agent-loop.test.ts tests/repl.test.ts tests/web-server.test.ts tests/web-prompt-context.test.ts tests/setup-local-state.test.ts
```

Expected: fails against existing daily runtime path.

- [ ] **Step 2: Remove daily summary hook from agent loop**

Delete `dailySummary` input and `appendDailySummaryAfterFinal` from `src/agent-loop.ts`. `runAgentLoop` should only return final answer/tool count.

- [ ] **Step 3: Replace prompt memory loading**

Modify `buildAgentRuntime` to use:

```ts
retrieveMemories({
  cwd: config.cwd,
  userCyreneDir: config.userCyreneDir,
  query: overrides.memoryQuery ?? '',
  task: overrides.memoryTask ?? 'conversation',
  maxItems: config.memoryRetrievalMaxItems,
  maxTokens: config.memoryRetrievalMaxTokens
})
```

and append `formatMemoryContext(...)`. Remove `loadDaily`.

- [ ] **Step 4: Wire post-run memory processing**

After trace finalize success in CLI/Web/REPL, call `processRunMemory` with `runId`, user prompt, final text, config, and traced/wrapped callModel. Catch errors and do not change user-facing output.

- [ ] **Step 5: Remove setup daily file**

Modify setup script to create `.cyrene/memory/index.jsonl`, `pending.jsonl`, `events.jsonl`, `tombstones.jsonl`, `projections/`, and `snapshots/`. It must not create `daily.md`.

- [ ] **Step 6: Verify Task 6**

Run:

```bash
npm test -- tests/agent-loop.test.ts tests/repl.test.ts tests/web-server.test.ts tests/web-prompt-context.test.ts tests/setup-local-state.test.ts
npm run typecheck
```

Expected: both pass.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/agent-loop.ts src/main.ts src/repl.ts src/web/server.ts src/web/prompt-context.ts scripts/setup-local-state.mjs src/config.ts tests/agent-loop.test.ts tests/repl.test.ts tests/web-server.test.ts tests/web-prompt-context.test.ts tests/setup-local-state.test.ts
git commit -m "feat: integrate personal memory runtime"
```

---

### Task 7: Legacy Test Cleanup And Full Verification

**Files:**
- Modify: `tests/memory-load.test.ts`
- Modify: `tests/memory-v2-integration.test.ts`
- Modify: `tests/daily-summary.test.ts`
- Modify: `tests/daily-compaction.test.ts`
- Modify: `tests/daily-logger.test.ts`
- Modify: `src/daily-summary.ts`
- Modify: `src/daily-compaction.ts`
- Modify: `src/daily-logger.ts`

- [ ] **Step 1: Convert or remove daily-specific tests**

Replace tests that assert daily write/compaction behavior with tests that assert:

```ts
legacy daily content is migrated once
daily runtime modules are not imported by runtime call sites
old daily files are removed by migration
```

If `src/daily-summary.ts`, `src/daily-compaction.ts`, or `src/daily-logger.ts` are no longer imported by production runtime, either delete them and their tests or leave them only if migration tests need a reader. Prefer deletion if no production/test import remains.

- [ ] **Step 2: Run targeted legacy suite**

Run:

```bash
npm test -- tests/memory-load.test.ts tests/memory-v2-integration.test.ts tests/daily-summary.test.ts tests/daily-compaction.test.ts tests/daily-logger.test.ts
```

Expected: pass or the deleted test files are no longer collected.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test
npm run typecheck
```

Expected: all tests pass and typecheck exits `0`.

- [ ] **Step 4: Commit final cleanup**

```bash
git add src tests scripts docs/superpowers/plans/2026-05-23-phase-3-personal-memory-core.md
git commit -m "test: update memory suite for personal core"
```

---

## Self-Review Checklist

- Spec coverage: store, pending, events, tombstones, snapshots, projections, retrieval, migration, CLI commands, runtime integration, daily removal are all mapped to tasks.
- TDD: each implementation task starts with failing tests and targeted verification.
- Scope control: no Web UI memory management, no vector DB, no daemon, no full affect engine.
- Risk: Task 6 and Task 7 touch many existing tests; if full daily deletion becomes too disruptive, keep legacy modules only as migration-only utilities while removing all runtime imports.
