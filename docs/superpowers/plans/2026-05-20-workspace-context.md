# Workspace Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Web agent runs operate inside selectable folders under `workspace/`, and let `Details > Context` preview Markdown files from the selected workspace.

**Architecture:** Keep the Web server's base cwd as the repository root for static assets and session history, then add a separate active workspace cwd for each run. Workspace discovery, validation, Markdown listing, and Markdown reading live in a focused backend helper so `server.ts` only wires HTTP routes and run creation.

**Tech Stack:** TypeScript, Node `fs/promises`, Node `path`, built-in HTTP server, browser DOM APIs, Vitest.

---

## File Structure

- Create `src/web/workspaces.ts`
  - Owns `workspace/` root resolution, safe workspace selection, top-level Markdown listing, and Markdown reading.
  - Rejects absolute paths, `..`, nested workspace ids, non-direct child workspaces, non-`.md` file ids, and symlink escapes.
- Create `tests/web-workspaces.test.ts`
  - Unit tests for helper behavior and path safety.
- Modify `src/web/server.ts`
  - Adds workspace and Markdown API routes.
  - Parses `workspaceId` in `POST /api/runs`.
  - Builds a per-run agent runtime using the selected workspace.
  - Keeps session storage under the repository base cwd.
- Modify `tests/web-server.test.ts`
  - Adds API/run integration tests for workspace selection and Markdown endpoints.
- Modify `src/web/static/index.html`
  - Adds the Workspace block in the left sidebar.
- Modify `src/web/static/app.js`
  - Loads workspaces.
  - Tracks selected workspace.
  - Sends selected workspace with run creation.
  - Loads top-level Markdown files for the selected workspace.
  - Renders selected Markdown in `Details > Context`.
- Modify `src/web/static/styles.css`
  - Styles Workspace block, chooser, Markdown preview, empty/error states.
  - Removes remaining large-panel external shadows and hard dark divider artifacts.
- Modify existing static assertions in `tests/web-server.test.ts`
  - Covers the new DOM and CSS/JS markers.

## Task 1: Workspace Helper

**Files:**
- Create: `src/web/workspaces.ts`
- Create: `tests/web-workspaces.test.ts`

- [ ] **Step 1: Write failing helper tests**

Add `tests/web-workspaces.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  listMarkdownFiles,
  listWorkspaces,
  readMarkdownFile,
  resolveWorkspace
} from '../src/web/workspaces.js'

describe('web workspace helpers', () => {
  const tempRoots: string[] = []

  async function createTempRepo(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'web-workspaces-test-'))
    tempRoots.push(root)
    return root
  }

  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it('lists workspace root and direct child directories only', async () => {
    const repo = await createTempRepo()
    await mkdir(join(repo, 'workspace', 'project-a', 'nested'), { recursive: true })
    await mkdir(join(repo, 'workspace', 'project-b'), { recursive: true })
    await writeFile(join(repo, 'workspace', 'note.md'), '# root\n', 'utf8')

    await expect(listWorkspaces(repo)).resolves.toEqual([
      { id: '', label: 'workspace', relativePath: 'workspace' },
      { id: 'project-a', label: 'workspace/project-a', relativePath: 'workspace/project-a' },
      { id: 'project-b', label: 'workspace/project-b', relativePath: 'workspace/project-b' }
    ])
  })

  it('returns a clear error when workspace root is missing', async () => {
    const repo = await createTempRepo()

    await expect(listWorkspaces(repo)).rejects.toThrow('workspace directory does not exist')
  })

  it('resolves only workspace root or direct child workspace ids', async () => {
    const repo = await createTempRepo()
    await mkdir(join(repo, 'workspace', 'project-a'), { recursive: true })

    await expect(resolveWorkspace(repo, undefined)).resolves.toMatchObject({
      id: '',
      label: 'workspace'
    })
    await expect(resolveWorkspace(repo, '')).resolves.toMatchObject({
      id: '',
      label: 'workspace'
    })
    await expect(resolveWorkspace(repo, 'project-a')).resolves.toMatchObject({
      id: 'project-a',
      label: 'workspace/project-a'
    })
    await expect(resolveWorkspace(repo, '../src')).rejects.toThrow('Invalid workspace id')
    await expect(resolveWorkspace(repo, '/tmp')).rejects.toThrow('Invalid workspace id')
    await expect(resolveWorkspace(repo, 'project-a/nested')).rejects.toThrow('Invalid workspace id')
  })

  it('rejects workspace symlinks that escape workspace root', async () => {
    const repo = await createTempRepo()
    const outside = await createTempRepo()
    await mkdir(join(repo, 'workspace'), { recursive: true })
    await symlink(outside, join(repo, 'workspace', 'linked'))

    await expect(resolveWorkspace(repo, 'linked')).rejects.toThrow('outside workspace root')
  })

  it('lists only top-level Markdown files in the selected workspace', async () => {
    const repo = await createTempRepo()
    await mkdir(join(repo, 'workspace', 'project-a', 'nested'), { recursive: true })
    await writeFile(join(repo, 'workspace', 'project-a', 'README.md'), '# readme\n', 'utf8')
    await writeFile(join(repo, 'workspace', 'project-a', 'notes.txt'), 'plain\n', 'utf8')
    await writeFile(join(repo, 'workspace', 'project-a', 'nested', 'deep.md'), '# deep\n', 'utf8')
    const workspace = await resolveWorkspace(repo, 'project-a')

    await expect(listMarkdownFiles(workspace)).resolves.toEqual([
      { id: 'README.md', label: 'README.md' }
    ])
  })

  it('reads only top-level Markdown files inside the selected workspace', async () => {
    const repo = await createTempRepo()
    await mkdir(join(repo, 'workspace', 'project-a'), { recursive: true })
    await writeFile(join(repo, 'workspace', 'project-a', 'README.md'), '# readme\n', 'utf8')
    await writeFile(join(repo, 'workspace', 'project-a', 'notes.txt'), 'plain\n', 'utf8')
    const workspace = await resolveWorkspace(repo, 'project-a')

    await expect(readMarkdownFile(workspace, 'README.md')).resolves.toEqual({
      id: 'README.md',
      content: '# readme\n'
    })
    await expect(readMarkdownFile(workspace, 'notes.txt')).rejects.toThrow('Markdown file id must end with .md')
    await expect(readMarkdownFile(workspace, '../README.md')).rejects.toThrow('Invalid Markdown file id')
  })

  it('rejects Markdown symlinks that escape the active workspace', async () => {
    const repo = await createTempRepo()
    const outside = await createTempRepo()
    await mkdir(join(repo, 'workspace', 'project-a'), { recursive: true })
    await writeFile(join(outside, 'outside.md'), '# outside\n', 'utf8')
    await symlink(join(outside, 'outside.md'), join(repo, 'workspace', 'project-a', 'linked.md'))
    const workspace = await resolveWorkspace(repo, 'project-a')

    await expect(readMarkdownFile(workspace, 'linked.md')).rejects.toThrow('outside active workspace')
    await expect(readFile(join(outside, 'outside.md'), 'utf8')).resolves.toBe('# outside\n')
  })
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```bash
npm test -- tests/web-workspaces.test.ts
```

Expected: FAIL because `src/web/workspaces.ts` does not exist.

- [ ] **Step 3: Implement the workspace helper**

Create `src/web/workspaces.ts`:

```ts
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { basename, isAbsolute, relative, resolve } from 'node:path'

export interface WorkspaceInfo {
  id: string
  label: string
  relativePath: string
  absolutePath: string
}

export interface PublicWorkspaceInfo {
  id: string
  label: string
  relativePath: string
}

export interface MarkdownFileInfo {
  id: string
  label: string
}

export interface MarkdownFileContent {
  id: string
  content: string
}

function publicWorkspace(workspace: WorkspaceInfo): PublicWorkspaceInfo {
  return {
    id: workspace.id,
    label: workspace.label,
    relativePath: workspace.relativePath
  }
}

function isInside(parent: string, child: string): boolean {
  const relativePath = relative(parent, child)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

function validateWorkspaceId(workspaceId: string | undefined): string {
  const id = workspaceId ?? ''
  if (id === '') return id
  if (isAbsolute(id) || id.split(/[\\/]+/).includes('..') || id.split(/[\\/]+/).length !== 1) {
    throw new Error(`Invalid workspace id: ${id}`)
  }
  return id
}

function validateMarkdownFileId(fileId: string): string {
  if (fileId.length === 0 || isAbsolute(fileId) || fileId.split(/[\\/]+/).includes('..') || fileId.split(/[\\/]+/).length !== 1) {
    throw new Error(`Invalid Markdown file id: ${fileId}`)
  }
  if (!fileId.endsWith('.md')) {
    throw new Error('Markdown file id must end with .md')
  }
  return fileId
}

export async function resolveWorkspace(repoCwd: string, workspaceId?: string): Promise<WorkspaceInfo> {
  const workspaceRoot = resolve(repoCwd, 'workspace')
  let canonicalRoot: string
  try {
    canonicalRoot = await realpath(workspaceRoot)
  } catch {
    throw new Error(`workspace directory does not exist: ${workspaceRoot}`)
  }

  const id = validateWorkspaceId(workspaceId)
  const absolutePath = id === '' ? canonicalRoot : resolve(canonicalRoot, id)
  let canonicalWorkspace: string
  try {
    canonicalWorkspace = await realpath(absolutePath)
  } catch {
    throw new Error(`Workspace not found: ${id || 'workspace'}`)
  }

  if (!isInside(canonicalRoot, canonicalWorkspace)) {
    throw new Error(`Workspace resolves outside workspace root: ${id}`)
  }

  if (id !== '') {
    const relativeToRoot = relative(canonicalRoot, canonicalWorkspace)
    if (relativeToRoot.split(/[\\/]+/).length !== 1) {
      throw new Error(`Workspace is not a direct child: ${id}`)
    }
    const stats = await lstat(resolve(canonicalRoot, id))
    if (!stats.isDirectory() && !stats.isSymbolicLink()) {
      throw new Error(`Workspace is not a directory: ${id}`)
    }
  }

  return {
    id,
    label: id === '' ? 'workspace' : `workspace/${id}`,
    relativePath: id === '' ? 'workspace' : `workspace/${id}`,
    absolutePath: canonicalWorkspace
  }
}

export async function listWorkspaces(repoCwd: string): Promise<PublicWorkspaceInfo[]> {
  const root = await resolveWorkspace(repoCwd, '')
  const entries = await readdir(root.absolutePath, { withFileTypes: true })
  const children: WorkspaceInfo[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue
    }
    try {
      children.push(await resolveWorkspace(repoCwd, entry.name))
    } catch {
      continue
    }
  }

  return [root, ...children.sort((a, b) => a.id.localeCompare(b.id))].map(publicWorkspace)
}

export async function listMarkdownFiles(workspace: WorkspaceInfo): Promise<MarkdownFileInfo[]> {
  const entries = await readdir(workspace.absolutePath, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => ({ id: entry.name, label: entry.name }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export async function readMarkdownFile(workspace: WorkspaceInfo, fileId: string): Promise<MarkdownFileContent> {
  const id = validateMarkdownFileId(fileId)
  const filePath = resolve(workspace.absolutePath, id)
  const canonicalFile = await realpath(filePath)
  if (!isInside(workspace.absolutePath, canonicalFile)) {
    throw new Error(`Markdown file resolves outside active workspace: ${id}`)
  }
  const relativeFile = relative(workspace.absolutePath, canonicalFile)
  if (basename(canonicalFile) !== id || relativeFile.split(/[\\/]+/).length !== 1) {
    throw new Error(`Markdown file is not top-level in active workspace: ${id}`)
  }
  return {
    id,
    content: await readFile(canonicalFile, 'utf8')
  }
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
npm test -- tests/web-workspaces.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit helper work**

```bash
git add src/web/workspaces.ts tests/web-workspaces.test.ts
git commit -m "feat: add web workspace helpers"
```

## Task 2: Web API and Per-Run Workspace Runtime

**Files:**
- Modify: `src/web/server.ts`
- Modify: `tests/web-server.test.ts`

- [ ] **Step 1: Add failing Web server integration tests**

In `tests/web-server.test.ts`, replace the existing `node:fs/promises` import with:

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
```

Update `createTempCwd` so ordinary Web server tests have the required `workspace/` directory:

```ts
async function createTempCwd(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'cc-local-web-server-'))
  tempDirs.push(cwd)
  await mkdir(join(cwd, 'workspace'), { recursive: true })
  return cwd
}

async function createTempCwdWithoutWorkspace(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'cc-local-web-server-'))
  tempDirs.push(cwd)
  return cwd
}
```

Add tests inside `describe('startWebServer', () => { ... })`:

```ts
  it('lists Web workspaces from the repository workspace directory', async () => {
    const cwd = await createTempCwd()
    await mkdir(join(cwd, 'workspace', 'project-a'), { recursive: true })
    await mkdir(join(cwd, 'workspace', 'project-b'), { recursive: true })
    await writeFile(join(cwd, 'workspace', 'README.md'), '# root\n', 'utf8')
    const server = await startServer(undefined, undefined, cwd)

    const response = await fetch(`${server.url}/api/workspaces`)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      workspaces: [
        { id: '', label: 'workspace', relativePath: 'workspace' },
        { id: 'project-a', label: 'workspace/project-a', relativePath: 'workspace/project-a' },
        { id: 'project-b', label: 'workspace/project-b', relativePath: 'workspace/project-b' }
      ]
    })
  })

  it('returns a clear error when the repository workspace directory is missing', async () => {
    const cwd = await createTempCwdWithoutWorkspace()
    const server = await startServer(undefined, undefined, cwd)

    const response = await fetch(`${server.url}/api/workspaces`)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: expect.stringContaining('workspace directory does not exist')
    })
  })

  it('lists and reads Markdown files for a selected workspace', async () => {
    const cwd = await createTempCwd()
    await mkdir(join(cwd, 'workspace', 'project-a'), { recursive: true })
    await writeFile(join(cwd, 'workspace', 'project-a', 'README.md'), '# Project A\n', 'utf8')
    await writeFile(join(cwd, 'workspace', 'project-a', 'notes.txt'), 'plain\n', 'utf8')
    const server = await startServer(undefined, undefined, cwd)

    const listResponse = await fetch(`${server.url}/api/workspaces/project-a/markdown`)
    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toEqual({
      files: [{ id: 'README.md', label: 'README.md' }]
    })

    const readResponse = await fetch(`${server.url}/api/workspaces/project-a/markdown/README.md`)
    expect(readResponse.status).toBe(200)
    await expect(readResponse.json()).resolves.toEqual({
      file: { id: 'README.md', content: '# Project A\n' }
    })
  })

  it('reads Markdown files from the workspace root route', async () => {
    const cwd = await createTempCwd()
    await mkdir(join(cwd, 'workspace'), { recursive: true })
    await writeFile(join(cwd, 'workspace', 'README.md'), '# Root Workspace\n', 'utf8')
    const server = await startServer(undefined, undefined, cwd)

    const listResponse = await fetch(`${server.url}/api/workspaces/@root/markdown`)
    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toEqual({
      files: [{ id: 'README.md', label: 'README.md' }]
    })

    const readResponse = await fetch(`${server.url}/api/workspaces/@root/markdown/README.md`)
    expect(readResponse.status).toBe(200)
    await expect(readResponse.json()).resolves.toEqual({
      file: { id: 'README.md', content: '# Root Workspace\n' }
    })
  })

  it('rejects Markdown reads outside the selected workspace', async () => {
    const cwd = await createTempCwd()
    await mkdir(join(cwd, 'workspace', 'project-a'), { recursive: true })
    await writeFile(join(cwd, 'workspace', 'README.md'), '# root\n', 'utf8')
    const server = await startServer(undefined, undefined, cwd)

    const response = await fetch(`${server.url}/api/workspaces/project-a/markdown/..%2FREADME.md`)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: expect.stringContaining('Invalid Markdown file id')
    })
  })

  it('uses the selected workspace cwd for Web agent tools', async () => {
    const cwd = await createTempCwd()
    await mkdir(join(cwd, 'workspace', 'project-a'), { recursive: true })
    await writeFile(join(cwd, 'workspace', 'project-a', 'README.md'), '# Project A\n', 'utf8')
    const callModel = vi.fn(async (): Promise<ModelResponse> => {
      if (callModel.mock.calls.length === 1) {
        return {
          content: '',
          toolCalls: [{
            id: 'call-read-readme',
            type: 'function',
            function: {
              name: 'file_read',
              arguments: JSON.stringify({ file_path: 'README.md' })
            }
          }]
        }
      }
      return { content: 'read workspace readme', toolCalls: [] }
    })
    const server = await startWebServer({ cwd, host: '127.0.0.1', port: 0, callModel })
    servers.push(server)

    const createResponse = await fetch(`${server.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'read readme', workspaceId: 'project-a' })
    })
    expect(createResponse.status).toBe(202)
    const createBody = (await createResponse.json()) as { runId: string }
    const { body: streamBody } = await readRunEventStream(`${server.url}/api/runs/${createBody.runId}/events`)

    expect(streamBody).toContain('"type":"tool_result","name":"file_read","ok":true')
    expect(streamBody).toContain('"summary":"README.md"')
    expect(callModel.mock.calls[1][0].messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'tool', content: expect.stringContaining('1 | # Project A') })
    ]))
  })
```

Update the local `startServer` helper near the bottom of `tests/web-server.test.ts` to accept an optional cwd:

```ts
async function startServer(
  callModel: ((input: CallModelInput) => Promise<ModelResponse>) | undefined = async (): Promise<ModelResponse> => ({
    content: 'web answer',
    toolCalls: []
  }),
  compactDailyIfNeeded?: (input: CompactDailyIfNeededInput) => Promise<void>,
  cwd?: string
): Promise<WebServerHandle> {
  const server = await startWebServer({
    cwd: cwd ?? await createTempCwd(),
    host: '127.0.0.1',
    port: 0,
    callModel,
    compactDailyIfNeeded
  })
  servers.push(server)
  return server
}
```

Update existing Web run tests whose tool fixtures currently live at the repository root. For example, in `streams tool events before the final response`, change:

```ts
    await writeFile(join(cwd, 'package.json'), '{"name":"web-prism-console-test"}\n')
```

to:

```ts
    await writeFile(join(cwd, 'workspace', 'package.json'), '{"name":"web-prism-console-test"}\n')
```

Update the existing daily compaction assertion because Web runs now compact against the active workspace runtime cwd:

```ts
    expect(compactDailyIfNeeded).toHaveBeenCalledWith({
      cwd: join(cwd, 'workspace'),
      config: expect.objectContaining({ cwd: join(cwd, 'workspace') }),
      callModel
    })
```

- [ ] **Step 2: Run Web server tests to verify they fail**

Run:

```bash
npm test -- tests/web-server.test.ts
```

Expected: FAIL because the workspace API routes and `workspaceId` run handling do not exist.

- [ ] **Step 3: Wire workspace routes and per-run runtime**

Modify `src/web/server.ts`.

Add imports:

```ts
import {
  listMarkdownFiles,
  listWorkspaces,
  readMarkdownFile,
  resolveWorkspace,
  type WorkspaceInfo
} from './workspaces.js'
```

Change `RunRecord`:

```ts
interface RunRecord {
  id: string
  cwd: string
  workspace: WorkspaceInfo
  sessionId: string
  userMessage: ChatMessage
  messages: ChatMessage[]
  events: WebRunEvent[]
  clients: Set<ServerResponse>
  done: boolean
}
```

Add routes in `routeRequest` before session/run event matching:

```ts
  if (request.method === 'GET' && url.pathname === '/api/workspaces') {
    await getWorkspaces(response, context)
    return
  }

  const markdownListMatch = /^\/api\/workspaces\/([^/]+)\/markdown$/.exec(url.pathname)
  if (request.method === 'GET' && markdownListMatch !== null) {
    await getWorkspaceMarkdown(response, context, decodeWorkspaceId(markdownListMatch[1]))
    return
  }

  const markdownReadMatch = /^\/api\/workspaces\/([^/]+)\/markdown\/([^/]+)$/.exec(url.pathname)
  if (request.method === 'GET' && markdownReadMatch !== null) {
    await getWorkspaceMarkdownFile(
      response,
      context,
      decodeWorkspaceId(markdownReadMatch[1]),
      decodeURIComponent(markdownReadMatch[2])
    )
    return
  }
```

Update `parseRunRequest` return type and body:

```ts
function parseRunRequest(
  body: unknown
): { ok: true; message: ChatMessage; sessionId?: string; workspaceId?: string } | { ok: false; error: string } {
  if (!isObject(body)) {
    return { ok: false, error: 'At least one user message is required.' }
  }

  const sessionId = typeof body.sessionId === 'string' && body.sessionId.trim().length > 0 ? body.sessionId : undefined
  const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : undefined
```

In each existing successful return from `parseRunRequest`, include `workspaceId`.

In `createRun`, resolve the workspace before session work:

```ts
  let workspace: WorkspaceInfo
  try {
    workspace = await resolveWorkspace(context.cwd, parsed.workspaceId)
  } catch (error) {
    writeJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
    return
  }
```

When creating `record`, include `workspace`:

```ts
  const record: RunRecord = {
    id: randomUUID(),
    cwd: context.cwd,
    workspace,
    sessionId: session.id,
    userMessage,
    messages,
    events: [],
    clients: new Set(),
    done: false
  }
```

Change run invocation:

```ts
    .then(() => runWebAgent(record, context.callModel, context.compactDailyIfNeeded))
```

Change `runWebAgent` signature and build runtime inside it:

```ts
async function runWebAgent(
  record: RunRecord,
  callModel?: (input: CallModelInput) => Promise<ModelResponse>,
  compactDailyIfNeeded?: (input: CompactDailyIfNeededInput) => Promise<void>
): Promise<void> {
  const runtime = await buildAgentRuntime(record.workspace.absolutePath)
  try {
```

Keep `appendSessionEvent` using `record.cwd`, and keep compaction using the runtime cwd:

```ts
      await (compactDailyIfNeeded ?? defaultCompactDailyIfNeeded)({
        cwd: runtime.config.cwd,
        config: runtime.config,
        callModel
      })
```

Add route helpers:

```ts
async function getWorkspaces(response: ServerResponse, context: WebServerContext): Promise<void> {
  try {
    writeJson(response, 200, { workspaces: await listWorkspaces(context.cwd) })
  } catch (error) {
    writeJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
  }
}

async function getWorkspaceMarkdown(
  response: ServerResponse,
  context: WebServerContext,
  workspaceId: string
): Promise<void> {
  try {
    const workspace = await resolveWorkspace(context.cwd, workspaceId)
    writeJson(response, 200, { files: await listMarkdownFiles(workspace) })
  } catch (error) {
    writeJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
  }
}

async function getWorkspaceMarkdownFile(
  response: ServerResponse,
  context: WebServerContext,
  workspaceId: string,
  fileId: string
): Promise<void> {
  try {
    const workspace = await resolveWorkspace(context.cwd, workspaceId)
    writeJson(response, 200, { file: await readMarkdownFile(workspace, fileId) })
  } catch (error) {
    writeJson(response, 400, { error: error instanceof Error ? error.message : String(error) })
  }
}

function decodeWorkspaceId(value: string): string {
  return value === '@root' ? '' : decodeURIComponent(value)
}
```

- [ ] **Step 4: Run Web server tests**

Run:

```bash
npm test -- tests/web-server.test.ts tests/web-workspaces.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Web API work**

```bash
git add src/web/server.ts src/web/workspaces.ts tests/web-server.test.ts tests/web-workspaces.test.ts
git commit -m "feat: run web agents in selected workspace"
```

## Task 3: Frontend Workspace Selector and Markdown Context

**Files:**
- Modify: `src/web/static/index.html`
- Modify: `src/web/static/app.js`
- Modify: `tests/web-server.test.ts`

- [ ] **Step 1: Add failing static tests for UI markers**

In `tests/web-server.test.ts`, update `serves the static shell from GET /` expectations:

```ts
    expect(body).toContain('id="workspacePanel"')
    expect(body).toContain('id="workspaceCurrent"')
    expect(body).toContain('id="workspaceChangeButton"')
    expect(body).toContain('id="workspacePicker"')
```

Update `serves refined Web UI interaction code from GET /static/app.js` expectations:

```ts
    expect(body).toContain('loadWorkspaces')
    expect(body).toContain('/api/workspaces')
    expect(body).toContain('workspaceId')
    expect(body).toContain('loadMarkdownFiles')
    expect(body).toContain('renderMarkdownPreview')
    expect(body).toContain('escapeHtml')
```

- [ ] **Step 2: Run static tests to verify they fail**

Run:

```bash
npm test -- tests/web-server.test.ts
```

Expected: FAIL because the new DOM and JS markers do not exist.

- [ ] **Step 3: Add Workspace block to HTML**

Modify `src/web/static/index.html` inside `.sidebar-full`, after the `nav-list` block:

```html
          <section id="workspacePanel" class="workspace-panel" aria-label="Workspace">
            <div class="workspace-panel-header">
              <span>Workspace</span>
              <button id="workspaceChangeButton" class="workspace-change-button" type="button">Change</button>
            </div>
            <div id="workspaceCurrent" class="workspace-current">workspace</div>
            <div id="workspacePicker" class="workspace-picker" hidden></div>
          </section>
```

- [ ] **Step 4: Extend frontend state and boot flow**

Modify `src/web/static/app.js`.

Add DOM references:

```js
const workspaceCurrent = document.querySelector('#workspaceCurrent')
const workspaceChangeButton = document.querySelector('#workspaceChangeButton')
const workspacePicker = document.querySelector('#workspacePicker')
```

Extend `state`:

```js
  workspaces: [],
  workspaceId: '',
  markdownFiles: [],
  selectedMarkdownId: '',
  selectedMarkdownContent: '',
  workspaceError: '',
  markdownError: '',
```

Replace startup:

```js
void loadWorkspaces()
void loadSessions()
```

Add listener:

```js
workspaceChangeButton?.addEventListener('click', () => {
  if (state.activeRun) {
    return
  }
  workspacePicker?.toggleAttribute('hidden')
})
```

- [ ] **Step 5: Send selected workspace with run creation**

In `sendPrompt`, update the request body:

```js
      body: JSON.stringify({ sessionId: state.sessionId, message: content, workspaceId: state.workspaceId })
```

- [ ] **Step 6: Add workspace and Markdown loading functions**

Add to `src/web/static/app.js`:

```js
async function loadWorkspaces() {
  let response
  try {
    response = await fetch('/api/workspaces')
  } catch (error) {
    state.workspaceError = error instanceof Error ? error.message : String(error)
    renderWorkspacePanel()
    renderInspector()
    return
  }
  if (!response.ok) {
    state.workspaceError = await response.text()
    renderWorkspacePanel()
    renderInspector()
    return
  }
  const body = await response.json()
  state.workspaces = Array.isArray(body.workspaces) ? body.workspaces : []
  if (!state.workspaces.some((workspace) => workspace.id === state.workspaceId)) {
    state.workspaceId = state.workspaces[0]?.id || ''
  }
  state.workspaceError = ''
  renderWorkspacePanel()
  await loadMarkdownFiles()
}

function renderWorkspacePanel() {
  const current = state.workspaces.find((workspace) => workspace.id === state.workspaceId)
  if (workspaceCurrent) {
    workspaceCurrent.textContent = current?.label || 'workspace'
  }
  if (workspaceChangeButton) {
    workspaceChangeButton.disabled = state.activeRun !== null || state.workspaces.length <= 1
  }
  if (!workspacePicker) {
    return
  }
  workspacePicker.replaceChildren()
  if (state.workspaceError) {
    workspacePicker.append(renderNote('Unable to load workspaces.'))
    workspacePicker.hidden = false
    return
  }
  for (const workspace of state.workspaces) {
    const button = document.createElement('button')
    button.className = 'workspace-option'
    button.type = 'button'
    button.textContent = workspace.label
    button.classList.toggle('is-active', workspace.id === state.workspaceId)
    button.disabled = state.activeRun !== null
    button.addEventListener('click', () => {
      state.workspaceId = workspace.id
      state.selectedMarkdownId = ''
      state.selectedMarkdownContent = ''
      workspacePicker.hidden = true
      renderWorkspacePanel()
      void loadMarkdownFiles()
    })
    workspacePicker.append(button)
  }
}

function encodedWorkspaceId() {
  return state.workspaceId === '' ? '@root' : encodeURIComponent(state.workspaceId)
}

async function loadMarkdownFiles() {
  state.markdownFiles = []
  state.selectedMarkdownId = ''
  state.selectedMarkdownContent = ''
  state.markdownError = ''
  renderInspector()

  let response
  try {
    response = await fetch(`/api/workspaces/${encodedWorkspaceId()}/markdown`)
  } catch (error) {
    state.markdownError = error instanceof Error ? error.message : String(error)
    renderInspector()
    return
  }
  if (!response.ok) {
    state.markdownError = await response.text()
    renderInspector()
    return
  }
  const body = await response.json()
  state.markdownFiles = Array.isArray(body.files) ? body.files : []
  state.selectedMarkdownId = state.markdownFiles[0]?.id || ''
  renderInspector()
  if (state.selectedMarkdownId) {
    await loadMarkdownFile(state.selectedMarkdownId)
  }
}

async function loadMarkdownFile(fileId) {
  state.selectedMarkdownId = fileId
  state.selectedMarkdownContent = ''
  state.markdownError = ''
  renderInspector()

  let response
  try {
    response = await fetch(`/api/workspaces/${encodedWorkspaceId()}/markdown/${encodeURIComponent(fileId)}`)
  } catch (error) {
    state.markdownError = error instanceof Error ? error.message : String(error)
    renderInspector()
    return
  }
  if (!response.ok) {
    state.markdownError = await response.text()
    renderInspector()
    return
  }
  const body = await response.json()
  state.selectedMarkdownContent = body.file?.content || ''
  renderInspector()
}
```

- [ ] **Step 7: Render Markdown Context tab**

Replace the `state.inspectorTab === 'context'` branch in `renderInspector`:

```js
  if (state.inspectorTab === 'context') {
    inspectorContent.replaceChildren(renderContextPanel())
    return
  }
```

Add these functions:

```js
function renderContextPanel() {
  const panel = document.createElement('div')
  panel.className = 'context-panel'

  if (state.markdownError) {
    panel.append(renderNote('Unable to load Markdown context.'))
    return panel
  }

  if (state.markdownFiles.length === 0) {
    panel.append(renderNote('No Markdown files in this workspace.'))
    return panel
  }

  const select = document.createElement('select')
  select.className = 'markdown-select'
  select.setAttribute('aria-label', 'Markdown file')
  for (const file of state.markdownFiles) {
    const option = document.createElement('option')
    option.value = file.id
    option.textContent = file.label
    option.selected = file.id === state.selectedMarkdownId
    select.append(option)
  }
  select.addEventListener('change', () => {
    void loadMarkdownFile(select.value)
  })

  const preview = document.createElement('div')
  preview.className = 'markdown-preview'
  preview.innerHTML = renderMarkdownPreview(state.selectedMarkdownContent)

  panel.append(select, preview)
  return panel
}

function renderMarkdownPreview(markdown) {
  if (!markdown.trim()) {
    return '<p class="muted">Selected Markdown file is empty.</p>'
  }

  const lines = markdown.split(/\r?\n/)
  const html = []
  let inList = false
  let inCode = false
  let codeLines = []

  function closeList() {
    if (inList) {
      html.push('</ul>')
      inList = false
    }
  }

  function closeCode() {
    if (inCode) {
      html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
      codeLines = []
      inCode = false
    }
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        closeCode()
      } else {
        closeList()
        inCode = true
      }
      continue
    }

    if (inCode) {
      codeLines.push(line)
      continue
    }

    if (line.startsWith('# ')) {
      closeList()
      html.push(`<h1>${escapeHtml(line.slice(2).trim())}</h1>`)
      continue
    }
    if (line.startsWith('## ')) {
      closeList()
      html.push(`<h2>${escapeHtml(line.slice(3).trim())}</h2>`)
      continue
    }
    if (line.startsWith('### ')) {
      closeList()
      html.push(`<h3>${escapeHtml(line.slice(4).trim())}</h3>`)
      continue
    }
    if (line.startsWith('- ')) {
      if (!inList) {
        html.push('<ul>')
        inList = true
      }
      html.push(`<li>${escapeHtml(line.slice(2).trim())}</li>`)
      continue
    }
    if (line.trim() === '') {
      closeList()
      continue
    }
    closeList()
    html.push(`<p>${escapeHtml(line)}</p>`)
  }

  closeCode()
  closeList()
  return html.join('')
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
```

- [ ] **Step 8: Keep workspace controls disabled during active runs**

In `setSending`, add:

```js
  if (workspaceChangeButton) {
    workspaceChangeButton.disabled = isSending || state.activeRun !== null || state.workspaces.length <= 1
  }
  renderWorkspacePanel()
```

- [ ] **Step 9: Run static tests**

Run:

```bash
npm test -- tests/web-server.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit frontend behavior**

```bash
git add src/web/static/index.html src/web/static/app.js tests/web-server.test.ts
git commit -m "feat: add workspace and markdown context UI"
```

## Task 4: Styling, Visual Cleanup, and Final Verification

**Files:**
- Modify: `src/web/static/styles.css`
- Modify: `tests/web-server.test.ts`

- [ ] **Step 1: Add failing CSS/static assertions**

In `tests/web-server.test.ts`, update `serves the Prism visual system from GET /static/styles.css`:

```ts
    expect(body).toContain('.workspace-panel')
    expect(body).toContain('.workspace-current')
    expect(body).toContain('.workspace-picker')
    expect(body).toContain('.markdown-preview')
    expect(body).toContain('.context-panel')
    expect(body).toMatch(/\.chat-shell \{[\s\S]*box-shadow: none/)
    expect(body).toMatch(/\.sidebar \{[\s\S]*box-shadow: none/)
```

- [ ] **Step 2: Run CSS/static tests to verify they fail**

Run:

```bash
npm test -- tests/web-server.test.ts
```

Expected: FAIL because the new CSS selectors and explicit panel shadow resets do not exist.

- [ ] **Step 3: Add sidebar workspace and Markdown styles**

Modify `src/web/static/styles.css`.

Add after `.session-history-empty`:

```css
.workspace-panel {
  display: grid;
  gap: 8px;
  margin-top: auto;
  padding-top: 12px;
}

.workspace-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #788399;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workspace-change-button {
  min-height: 0;
  padding: 0;
  color: #59657a;
  font-size: 12px;
  font-weight: 700;
  background: transparent;
  cursor: pointer;
}

.workspace-current {
  min-width: 0;
  overflow: hidden;
  padding: 10px 11px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.62);
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-picker {
  display: grid;
  gap: 6px;
}

.workspace-option {
  min-width: 0;
  padding: 8px 10px;
  border-radius: 12px;
  color: var(--ink);
  text-align: left;
  background: rgba(255, 255, 255, 0.48);
  cursor: pointer;
}

.workspace-option:hover,
.workspace-option.is-active {
  background: rgba(255, 255, 255, 0.74);
}
```

Add near inspector styles:

```css
.context-panel {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.markdown-select {
  width: 100%;
  min-width: 0;
  height: 40px;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0 10px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.72);
}

.markdown-preview {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.62);
  overflow-wrap: anywhere;
}

.markdown-preview h1,
.markdown-preview h2,
.markdown-preview h3,
.markdown-preview p,
.markdown-preview ul,
.markdown-preview pre {
  margin: 0 0 10px;
}

.markdown-preview h1 {
  font-size: 19px;
  line-height: 1.25;
}

.markdown-preview h2 {
  font-size: 16px;
  line-height: 1.3;
}

.markdown-preview h3 {
  font-size: 14px;
  line-height: 1.35;
}

.markdown-preview p,
.markdown-preview li {
  color: #4d5a6f;
  font-size: 13px;
  line-height: 1.5;
}

.markdown-preview ul {
  padding-left: 18px;
}

.markdown-preview pre {
  overflow-x: auto;
  padding: 10px;
  border-radius: 12px;
  background: rgba(36, 48, 68, 0.08);
}

.markdown-preview code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
}
```

- [ ] **Step 4: Remove large-panel external shadows and hard dividers**

Add explicit large-panel resets near `.sidebar`, `.chat-shell`, `.inspector`:

```css
.sidebar,
.chat-shell {
  box-shadow: none;
}
```

If a dark separator still appears from the chat header area, keep `.run-status-line` low contrast and avoid borders. Ensure `.chat-header` does not add `border-bottom`.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
npm test -- tests/web-server.test.ts tests/web-workspaces.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run full verification**

Run:

```bash
npm run typecheck
npm test
```

Expected: both PASS.

- [ ] **Step 7: Manual browser smoke test**

Run the Web UI:

```bash
npm run dev -- --web --port 4317
```

Open:

```text
http://127.0.0.1:4317
```

Verify:

- Left sidebar shows a bottom Workspace block with no helper text.
- Workspace selector lists only `workspace/` and direct child folders.
- Sending a prompt with a selected child workspace reads/writes relative to that folder.
- `Details > Context` lists top-level `.md` files in the selected workspace.
- Selecting a Markdown file renders headings, paragraphs, lists, and fenced code as preview HTML.
- Expanded left and center panels do not show visible external shadows.
- No hard dark divider line appears in the center chat shell.

- [ ] **Step 8: Commit styling and verification work**

```bash
git add src/web/static/styles.css tests/web-server.test.ts
git commit -m "style: polish workspace context panels"
```

## Final Checks

- [ ] Run `git status --short` and confirm only intentional files remain changed.
- [ ] If `.gitignore` is still modified from the earlier `workspace/` ignore change, leave it unstaged unless the user asks to include it.
- [ ] Stop any local dev server started for manual verification.
- [ ] Report test results and any remaining uncommitted files.
