# Cyrene Naming Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 Jarvis runtime 干净迁移为 Cyrene，不保留 `JARVIS_*` alias，不读取 `.jarvis/` fallback，并丢弃旧 session/daily state。

**Architecture:** 先用 failing tests 固定 `CYRENE_*`、`.cyrene/`、`cyrene` CLI 的目标行为，再做最小代码和文档迁移。State 路径仍由现有 `config.ts`、`memory.ts`、`session-store.ts` 负责，不引入新 abstraction，不实现 Phase 0 FeatureFlags。

**Tech Stack:** TypeScript、Node.js 20+、Commander、Vitest、tsx、shell、GitHub CLI。

---

## 文件结构

- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/package.json`
  - `name` 和 `bin` 从 `jarvis` 改为 `cyrene`。
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/package-lock.json`
  - package lock 中的 root package name 同步为 `cyrene`。
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/.env.example`
  - `JARVIS_*` 改为 `CYRENE_*`。
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/.gitignore`
  - `.jarvis/` 改为 `.cyrene/`，保留 `.codegraph/` ignore。
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/README.md`
  - 新用户文档改为 Cyrene、`.cyrene/`、`CYRENE_*`、`cyrene`。
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/scripts/setup-local-state.mjs`
  - setup 初始化 `.cyrene/memory/daily.md`。
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/src/config.ts`
  - `userJarvisDir` 改为 `userCyreneDir`，读取 `CYRENE_BASE_URL` / `CYRENE_MODEL`。
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/src/main.ts`
  - CLI 名称、描述、Web 启动输出改为 `cyrene` / `Cyrene`。
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/src/prompts/system.md`
  - 默认身份改为 Cyrene。
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/src/memory.ts`
  - `.jarvis` 路径改为 `.cyrene`，参数名改为 `userCyreneDir`。
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/src/session-store.ts`
  - session store 路径改为 `.cyrene/sessions`。
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/src/web/prompt-context.ts`
  - 使用 `config.userCyreneDir`。
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/src/ui-observer.ts`
  - terminal identity 改为 Cyrene。
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/src/web/static/*`
  - 清理残留 jarvis 文案；已有 Cyrene 文案保持。
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/tests/*.test.ts`
  - 所有路径/env/CLI 断言改为 Cyrene，并新增旧名不读取测试。

## Task 1: Config 和 State Path TDD

**Files:**
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/tests/config.test.ts`
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/src/config.ts`

- [ ] **Step 1: 写 failing tests**

在 `tests/config.test.ts` 中做这些行为断言：

```ts
it('uses the Cyrene OpenAI-compatible endpoint environment overrides when present', () => {
  vi.stubEnv('CYRENE_BASE_URL', 'http://127.0.0.1:9999/v1')
  vi.stubEnv('CYRENE_MODEL', 'custom-cyrene-model')

  const config = createDefaultConfig('/tmp/project')

  expect(config.model.baseUrl).toBe('http://127.0.0.1:9999/v1')
  expect(config.model.model).toBe('custom-cyrene-model')
})

it('ignores deprecated Jarvis model environment variables', () => {
  vi.stubEnv('JARVIS_BASE_URL', 'http://127.0.0.1:9999/v1')
  vi.stubEnv('JARVIS_MODEL', 'old-jarvis-model')

  const config = createDefaultConfig('/tmp/project')

  expect(config.model.baseUrl).toBe('http://127.0.0.1:8080/v1')
  expect(config.model.model).toBe('Qwen3.5-9B-MLX-4bit')
})
```

并把 safety/context test 中的 property 断言改成：

```ts
expect(config.userCyreneDir).toBe(join(homedir(), '.cyrene'))
```

- [ ] **Step 2: 验证 RED**

Run:

```bash
npm test -- tests/config.test.ts
```

Expected: fail，因为 `CYRENE_*` 尚未被读取，`userCyreneDir` 尚不存在。

- [ ] **Step 3: 实现最小 config 修改**

在 `src/config.ts` 中：

```ts
userJarvisDir: string
```

改为：

```ts
userCyreneDir: string
```

并把 model env 从：

```ts
baseUrl: process.env.JARVIS_BASE_URL ?? 'http://127.0.0.1:8080/v1',
model: process.env.JARVIS_MODEL ?? 'Qwen3.5-9B-MLX-4bit',
```

改为：

```ts
baseUrl: process.env.CYRENE_BASE_URL ?? 'http://127.0.0.1:8080/v1',
model: process.env.CYRENE_MODEL ?? 'Qwen3.5-9B-MLX-4bit',
```

并把：

```ts
userJarvisDir: join(homedir(), '.jarvis'),
```

改为：

```ts
userCyreneDir: join(homedir(), '.cyrene'),
```

- [ ] **Step 4: 验证 GREEN**

Run:

```bash
npm test -- tests/config.test.ts
npm run typecheck
```

Expected: config tests pass；typecheck 可能暴露 `userJarvisDir` call sites，下一 task 修复。

## Task 2: Memory 和 Session Path TDD

**Files:**
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/tests/memory-load.test.ts`
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/tests/main-cli.test.ts`
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/tests/session-store.test.ts`
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/src/memory.ts`
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/src/session-store.ts`
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/src/web/prompt-context.ts`

- [ ] **Step 1: 写 failing tests**

把 test fixtures 里的 `.jarvis` 路径改为 `.cyrene`。新增或更新断言：

```ts
await mkdir(join(root, '.cyrene'), { recursive: true })
await writeFile(join(root, '.cyrene', 'instructions.md'), 'Use TDD.\n')
```

session 断言应指向：

```ts
join(root, '.cyrene', 'sessions', 'index.json')
```

main CLI system prompt 测试应使用：

```ts
const userCyreneDir = join(home, '.cyrene')
await mkdir(join(root, '.cyrene'), { recursive: true })
await writeFile(join(userCyreneDir, 'soul.md'), 'Be direct.\n')
await writeFile(join(userCyreneDir, 'Rule.md'), 'Global rule.\n')
```

并保留旧目录不读取的行为测试：

```ts
await mkdir(join(root, '.jarvis'), { recursive: true })
await writeFile(join(root, '.jarvis', 'instructions.md'), 'Old instruction.\n')
const systemPrompt = await loadInstructionsIfExists(root)
expect(systemPrompt).toBe('')
```

- [ ] **Step 2: 验证 RED**

Run:

```bash
npm test -- tests/memory-load.test.ts tests/session-store.test.ts tests/main-cli.test.ts
```

Expected: fail，因为 runtime 仍读写 `.jarvis` 和 `userJarvisDir`。

- [ ] **Step 3: 实现最小 path 修改**

在 `src/memory.ts` 中把 `.jarvis` 路径统一改为 `.cyrene`，函数参数名从 `userJarvisDir` 改为 `userCyreneDir`。核心替换：

```ts
join(cwd, '.cyrene', 'instructions.md')
join(userCyreneDir, 'Rule.md')
join(currentDir, '.cyrene', 'Rule.md')
join(cwd, '.cyrene', 'memory')
join(cwd, '.cyrene', 'memory', 'sessions')
join(cwdRealPath, '.cyrene')
```

在 `src/session-store.ts` 中：

```ts
return resolve(cwd, '.cyrene', 'sessions')
```

在 `src/web/prompt-context.ts` 中把所有 `config.userJarvisDir` 改为：

```ts
config.userCyreneDir
```

- [ ] **Step 4: 验证 GREEN**

Run:

```bash
npm test -- tests/memory-load.test.ts tests/session-store.test.ts tests/main-cli.test.ts
npm run typecheck
```

Expected: targeted tests pass；typecheck pass 或只剩文案/CLI 测试待改。

## Task 3: CLI、Package、Docs 和 Setup Rename

**Files:**
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/package.json`
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/package-lock.json`
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/.env.example`
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/.gitignore`
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/README.md`
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/scripts/setup-local-state.mjs`
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/src/main.ts`
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/src/prompts/system.md`
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/src/ui-observer.ts`
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/tests/main-cli.test.ts`
- Modify: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/tests/server-start.test.ts`

- [ ] **Step 1: 写 failing tests**

更新 CLI/Web output 测试：

```ts
if (/cyrene web listening at http:\/\/127\.0\.0\.1:\d+/.test(stdout)) {
  clearTimeout(timeout)
  resolve()
}
expect(stdout).toMatch(/cyrene web listening at http:\/\/127\.0\.0\.1:\d+\n/)
```

更新 env 使用：

```ts
CYRENE_BASE_URL: `http://127.0.0.1:${address.port}/v1`
```

更新 temp dir labels：

```ts
await mkdtemp(join(tmpdir(), 'cyrene-main-home-'))
```

- [ ] **Step 2: 验证 RED**

Run:

```bash
npm test -- tests/main-cli.test.ts tests/server-start.test.ts
```

Expected: fail，因为 CLI 输出和 package metadata 仍是 jarvis。

- [ ] **Step 3: 实现 rename**

核心修改：

```json
{
  "name": "cyrene",
  "bin": { "cyrene": "src/main.ts" }
}
```

`src/main.ts`：

```ts
.name('cyrene')
.description('Cyrene local-first agent runtime powered by an OpenAI-compatible model endpoint.')
console.log(`cyrene web listening at ${server.url}`)
```

`src/prompts/system.md` 第一行：

```md
You are Cyrene, a local Claude Code-style coding agent.
```

`.env.example`：

```env
CYRENE_BASE_URL=http://127.0.0.1:8080/v1
CYRENE_MODEL=Qwen3.5-9B-MLX-4bit
```

`.gitignore`：

```gitignore
.cyrene/
```

`scripts/setup-local-state.mjs` 创建：

```txt
.cyrene/memory/daily.md
```

README 使用 `# Cyrene`、`.cyrene/memory/daily.md`、`CYRENE_BASE_URL`、`CYRENE_MODEL`。

- [ ] **Step 4: 验证 GREEN**

Run:

```bash
npm test -- tests/main-cli.test.ts tests/server-start.test.ts tests/config.test.ts
npm run typecheck
```

Expected: targeted tests pass；typecheck pass。

## Task 4: 残留清理和全量验证

**Files:**
- Modify: any remaining files reported by `rg`.
- Verify only: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/docs/superpowers/specs/2026-05-23-cyrene-naming-foundation-design.md`
- Verify only: `/Users/phoenix/Assistant/Jarvis/.worktrees/cyrene-naming-foundation/docs/superpowers/plans/2026-05-23-cyrene-naming-foundation.md`

- [ ] **Step 1: 运行残留扫描**

Run:

```bash
rg -n "Jarvis|jarvis|JARVIS|\\.jarvis" package.json package-lock.json .env.example .gitignore README.md scripts src tests docs/superpowers/specs docs/superpowers/plans
```

Expected: only spec/plan and tests that explicitly validate old-name behavior may contain old names.

- [ ] **Step 2: 删除或改掉不允许残留**

不允许残留的目标文件：

```txt
package.json
package-lock.json
.env.example
.gitignore
README.md
scripts/setup-local-state.mjs
src/**/*.ts
src/prompts/system.md
src/web/static/*
```

如果 `src/**/*.ts` 还出现 `Jarvis`，改为 `Cyrene`。如果 active runtime 还出现 `.jarvis`，改为 `.cyrene`。

- [ ] **Step 3: 全量验证**

Run:

```bash
npm run typecheck
npm test
rg -n "Jarvis|jarvis|JARVIS|\\.jarvis" package.json package-lock.json .env.example .gitignore README.md scripts src tests docs/superpowers/specs docs/superpowers/plans
git diff --check
```

Expected:

```txt
typecheck exit 0
34 test files passed
old-name rg output only in spec/plan/tests allowlist
git diff --check exit 0
```

## Task 5: Commit 和后续 repo rename 准备

**Files:**
- Commit all implementation changes in the worktree.

- [ ] **Step 1: Review diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only naming migration files and plan file changed.

- [ ] **Step 2: Commit**

Run:

```bash
git add .
git commit -m "chore: rename runtime to Cyrene"
```

Expected: commit created on `codex/cyrene-naming-foundation`.

- [ ] **Step 3: Remote/local directory rename remains manual-gated**

Do not rename GitHub repo or outer checkout until code migration is verified. After review, use:

```bash
gh api --method PATCH repos/mingxiangbian/Jarvis -f name=Cyrene
git remote set-url origin <new-url>
```

Then rename outer checkout from `/Users/phoenix/Assistant/Jarvis` to `/Users/phoenix/Assistant/Cyrene` only after the branch is merged or user explicitly asks.
