# Web Session UI Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add title-only session rows with persisted pin/delete actions, a Cyrene avatar collapsed-sidebar expand button, and a Cyrene-style night glass theme toggle.

**Architecture:** Extend the existing project-local session index with a `pinned` flag and add focused store/API methods for pinning and deletion. Keep the Web UI static and framework-free: render the session action menu in `app.js`, use inline SVG line icons, and drive light/dark styling through CSS variables and a `body.theme-dark` class.

**Tech Stack:** TypeScript, Node HTTP server, Vitest, static HTML/CSS/JavaScript.

---

## File Map

- Modify `src/session-store.ts`: add `pinned`, sorted listing, `deleteSession`, and `updateSessionPinned`.
- Modify `tests/session-store.test.ts`: cover legacy `pinned`, sorted pins, pin/unpin persistence, and delete behavior.
- Modify `src/web/server.ts`: add `DELETE /api/sessions/:id` and `PATCH /api/sessions/:id`.
- Modify `tests/web-server.test.ts`: cover new API endpoints and static UI/CSS assertions.
- Modify `src/web/static/index.html`: add the icon-only theme toggle and replace the collapsed expand glyph with an avatar image.
- Modify `src/web/static/app.js`: add theme state, menu state, pin/delete handlers, and title-only session rendering.
- Modify `src/web/static/styles.css`: add session menu styles, rail avatar styles, icon button refinements, and the night glass theme variables.

---

### Task 1: Session Store Pin/Delete

**Files:**
- Modify: `src/session-store.ts`
- Test: `tests/session-store.test.ts`

- [ ] **Step 1: Write failing session-store tests**

Add `writeFile` to the existing `node:fs/promises` import only if it is not already present, and add the new store functions to the import list:

```typescript
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import {
  appendSessionEvent,
  createSession,
  deleteSession,
  listSessions,
  loadSession,
  updateSessionPinned
} from '../src/session-store.js'
```

Append these tests inside `describe('session store', () => { ... })`:

```typescript
  it('sorts pinned sessions first while keeping updated order within groups', async () => {
    const cwd = await createTempCwd()
    await createSession({
      cwd,
      mode: 'web',
      model: 'test-model',
      id: 'older-pinned',
      now: new Date('2026-05-20T01:00:00.000Z'),
      firstUserMessage: { role: 'user', content: 'Older pinned' }
    })
    await createSession({
      cwd,
      mode: 'web',
      model: 'test-model',
      id: 'newer-unpinned',
      now: new Date('2026-05-20T03:00:00.000Z'),
      firstUserMessage: { role: 'user', content: 'Newer unpinned' }
    })
    await createSession({
      cwd,
      mode: 'web',
      model: 'test-model',
      id: 'newer-pinned',
      now: new Date('2026-05-20T02:00:00.000Z'),
      firstUserMessage: { role: 'user', content: 'Newer pinned' }
    })

    await updateSessionPinned({ cwd, sessionId: 'older-pinned', pinned: true })
    await updateSessionPinned({ cwd, sessionId: 'newer-pinned', pinned: true })

    await expect(listSessions(cwd)).resolves.toMatchObject([
      { id: 'newer-pinned', pinned: true },
      { id: 'older-pinned', pinned: true },
      { id: 'newer-unpinned', pinned: false }
    ])
  })

  it('updates pinned state and persists it through the session index', async () => {
    const cwd = await createTempCwd()
    await createSession({
      cwd,
      mode: 'web',
      model: 'test-model',
      id: 'pin-me',
      firstUserMessage: { role: 'user', content: 'Pin this chat' }
    })

    await expect(updateSessionPinned({ cwd, sessionId: 'pin-me', pinned: true })).resolves.toEqual(
      expect.objectContaining({ id: 'pin-me', pinned: true })
    )
    await expect(listSessions(cwd)).resolves.toEqual([
      expect.objectContaining({ id: 'pin-me', pinned: true })
    ])
    await expect(updateSessionPinned({ cwd, sessionId: 'pin-me', pinned: false })).resolves.toEqual(
      expect.objectContaining({ id: 'pin-me', pinned: false })
    )
    await expect(updateSessionPinned({ cwd, sessionId: 'missing', pinned: true })).resolves.toBeNull()
  })

  it('treats legacy index entries without pinned as unpinned', async () => {
    const cwd = await createTempCwd()
    await mkdir(join(cwd, '.cc-local', 'sessions'), { recursive: true })
    await writeFile(join(cwd, '.cc-local', 'sessions', 'index.json'), JSON.stringify([
      {
        id: 'legacy',
        mode: 'web',
        title: 'Legacy session',
        preview: '',
        createdAt: '2026-05-20T01:00:00.000Z',
        updatedAt: '2026-05-20T01:00:00.000Z',
        model: 'test-model'
      }
    ]), 'utf8')

    await expect(listSessions(cwd)).resolves.toEqual([
      expect.objectContaining({ id: 'legacy', pinned: false })
    ])
  })

  it('deletes sessions from the index and removes their JSONL file', async () => {
    const cwd = await createTempCwd()
    await createSession({
      cwd,
      mode: 'web',
      model: 'test-model',
      id: 'delete-me',
      firstUserMessage: { role: 'user', content: 'Delete this chat' }
    })

    await expect(deleteSession({ cwd, sessionId: 'delete-me' })).resolves.toBe(true)
    await expect(listSessions(cwd)).resolves.toEqual([])
    await expect(readFile(join(cwd, '.cc-local', 'sessions', 'delete-me.jsonl'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })
    await expect(deleteSession({ cwd, sessionId: 'delete-me' })).resolves.toBe(false)
  })

  it('deletes index entries even when the JSONL file is already missing', async () => {
    const cwd = await createTempCwd()
    await createSession({
      cwd,
      mode: 'web',
      model: 'test-model',
      id: 'missing-jsonl',
      firstUserMessage: { role: 'user', content: 'Missing file' }
    })
    await rm(join(cwd, '.cc-local', 'sessions', 'missing-jsonl.jsonl'))

    await expect(deleteSession({ cwd, sessionId: 'missing-jsonl' })).resolves.toBe(true)
    await expect(listSessions(cwd)).resolves.toEqual([])
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/session-store.test.ts
```

Expected: FAIL because `deleteSession` and `updateSessionPinned` are not exported.

- [ ] **Step 3: Implement the store changes**

In `src/session-store.ts`, add `rm` to the import:

```typescript
import { appendFile, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
```

Update `SessionIndexItem`:

```typescript
export interface SessionIndexItem {
  id: string
  mode: SessionMode
  title: string
  preview: string
  createdAt: string
  updatedAt: string
  model: string
  pinned: boolean
}
```

Set `pinned: false` in `createSession`:

```typescript
  const session: SessionIndexItem = {
    id,
    mode: input.mode,
    title: titleFromMessage(input.firstUserMessage) ?? 'Untitled session',
    preview: previewFromMessage(input.firstUserMessage) ?? '',
    createdAt: now,
    updatedAt: now,
    model: input.model,
    pinned: false
  }
```

Add these exported functions after `listSessions`:

```typescript
export async function updateSessionPinned(input: {
  cwd: string
  sessionId: string
  pinned: boolean
}): Promise<SessionIndexItem | null> {
  assertSafeSessionId(input.sessionId)
  const index = await readIndex(input.cwd)
  const existing = index.find((item) => item.id === input.sessionId)
  if (existing === undefined) {
    return null
  }

  const next = { ...existing, pinned: input.pinned }
  await writeIndex(input.cwd, upsertSession(index, next))
  return next
}

export async function deleteSession(input: { cwd: string; sessionId: string }): Promise<boolean> {
  assertSafeSessionId(input.sessionId)
  const index = await readIndex(input.cwd)
  const existing = index.find((item) => item.id === input.sessionId)
  if (existing === undefined) {
    return false
  }

  const path = sessionFilePath(input.cwd, input.sessionId)
  await assertPathIsNotSymlink(path)
  await rm(path).catch((error: unknown) => {
    if (isObject(error) && error.code === 'ENOENT') {
      return
    }
    throw error
  })
  await writeIndex(input.cwd, index.filter((item) => item.id !== input.sessionId))
  return true
}
```

Replace `compareSessions`:

```typescript
function compareSessions(left: SessionIndexItem, right: SessionIndexItem): number {
  if (left.pinned !== right.pinned) {
    return left.pinned ? -1 : 1
  }
  return right.updatedAt.localeCompare(left.updatedAt)
}
```

Replace the return inside `readIndex` so legacy entries are normalized:

```typescript
    return parsed.filter(isSessionIndexItem).map(normalizeSessionIndexItem).sort(compareSessions)
```

Add this helper near `isSessionIndexItem`:

```typescript
function normalizeSessionIndexItem(value: LegacySessionIndexItem): SessionIndexItem {
  return {
    ...value,
    pinned: value.pinned === true
  }
}
```

Replace `isSessionIndexItem` with a legacy-aware type:

```typescript
type LegacySessionIndexItem = Omit<SessionIndexItem, 'pinned'> & { pinned?: unknown }

function isSessionIndexItem(value: unknown): value is LegacySessionIndexItem {
  return isObject(value) &&
    typeof value.id === 'string' &&
    (value.mode === 'web' || value.mode === 'repl') &&
    typeof value.title === 'string' &&
    typeof value.preview === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    typeof value.model === 'string' &&
    (value.pinned === undefined || typeof value.pinned === 'boolean')
}
```

- [ ] **Step 4: Run store tests**

Run:

```bash
npm test -- tests/session-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit store changes**

```bash
git add src/session-store.ts tests/session-store.test.ts
git commit -m "feat: add session pin and delete store"
```

---

### Task 2: Session API Endpoints

**Files:**
- Modify: `src/web/server.ts`
- Test: `tests/web-server.test.ts`

- [ ] **Step 1: Write failing Web API tests**

Add this test near the existing session persistence tests in `tests/web-server.test.ts`:

```typescript
  it('updates pinned state through PATCH /api/sessions/:id', async () => {
    const server = await startServer(async (): Promise<ModelResponse> => ({ content: 'answer', toolCalls: [] }))
    const createResponse = await fetch(`${server.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'pin through api' })
    })
    const createBody = (await createResponse.json()) as { runId: string; sessionId: string }
    await fetch(`${server.url}/api/runs/${createBody.runId}/events`).then((response) => response.text())

    const patchResponse = await fetch(`${server.url}/api/sessions/${createBody.sessionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pinned: true })
    })

    expect(patchResponse.status).toBe(200)
    await expect(patchResponse.json()).resolves.toEqual({
      session: expect.objectContaining({ id: createBody.sessionId, pinned: true })
    })

    const listResponse = await fetch(`${server.url}/api/sessions`)
    await expect(listResponse.json()).resolves.toEqual({
      sessions: [expect.objectContaining({ id: createBody.sessionId, pinned: true })]
    })
  })

  it('validates PATCH /api/sessions/:id bodies and missing sessions', async () => {
    const server = await startServer()

    const invalidJsonResponse = await fetch(`${server.url}/api/sessions/missing`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{'
    })
    expect(invalidJsonResponse.status).toBe(400)
    await expect(invalidJsonResponse.json()).resolves.toEqual({ error: 'Invalid JSON body.' })

    const invalidPinnedResponse = await fetch(`${server.url}/api/sessions/missing`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pinned: 'yes' })
    })
    expect(invalidPinnedResponse.status).toBe(400)
    await expect(invalidPinnedResponse.json()).resolves.toEqual({ error: 'pinned must be a boolean.' })

    const missingResponse = await fetch(`${server.url}/api/sessions/missing`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pinned: true })
    })
    expect(missingResponse.status).toBe(404)
    await expect(missingResponse.json()).resolves.toEqual({ error: 'Session not found.' })
  })

  it('deletes sessions through DELETE /api/sessions/:id', async () => {
    const server = await startServer(async (): Promise<ModelResponse> => ({ content: 'delete answer', toolCalls: [] }))
    const createResponse = await fetch(`${server.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'delete through api' })
    })
    const createBody = (await createResponse.json()) as { runId: string; sessionId: string }
    await fetch(`${server.url}/api/runs/${createBody.runId}/events`).then((response) => response.text())

    const deleteResponse = await fetch(`${server.url}/api/sessions/${createBody.sessionId}`, { method: 'DELETE' })
    expect(deleteResponse.status).toBe(200)
    await expect(deleteResponse.json()).resolves.toEqual({ deleted: true })

    const listResponse = await fetch(`${server.url}/api/sessions`)
    await expect(listResponse.json()).resolves.toEqual({ sessions: [] })

    const missingResponse = await fetch(`${server.url}/api/sessions/${createBody.sessionId}`, { method: 'DELETE' })
    expect(missingResponse.status).toBe(404)
    await expect(missingResponse.json()).resolves.toEqual({ error: 'Session not found.' })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/web-server.test.ts
```

Expected: FAIL because `PATCH` and `DELETE` return 404.

- [ ] **Step 3: Implement API routes**

Update the session-store import in `src/web/server.ts`:

```typescript
  appendSessionEvent,
  createSession,
  deleteSession,
  listSessions,
  loadSession,
  updateSessionPinned,
  type SessionIndexItem
```

Add route branches after the existing `GET /api/sessions/:id` branch:

```typescript
  if (request.method === 'PATCH' && sessionMatch !== null) {
    await patchSession(request, response, context, decodeURIComponent(sessionMatch[1]))
    return
  }

  if (request.method === 'DELETE' && sessionMatch !== null) {
    await deleteSessionRoute(response, context, decodeURIComponent(sessionMatch[1]))
    return
  }
```

Add these functions after `getSession`:

```typescript
async function patchSession(
  request: IncomingMessage,
  response: ServerResponse,
  context: WebServerContext,
  sessionId: string
): Promise<void> {
  let body: unknown
  try {
    body = JSON.parse(await readRequestBody(request))
  } catch {
    writeJson(response, 400, { error: 'Invalid JSON body.' })
    return
  }
  if (!isObject(body) || typeof body.pinned !== 'boolean') {
    writeJson(response, 400, { error: 'pinned must be a boolean.' })
    return
  }

  let session: SessionIndexItem | null
  try {
    session = await updateSessionPinned({ cwd: context.cwd, sessionId, pinned: body.pinned })
  } catch (error) {
    if (isUnsafeSessionError(error)) {
      writeJson(response, 400, { error: 'Invalid session id.' })
      return
    }
    throw error
  }
  if (session === null) {
    writeJson(response, 404, { error: 'Session not found.' })
    return
  }
  writeJson(response, 200, { session })
}

async function deleteSessionRoute(
  response: ServerResponse,
  context: WebServerContext,
  sessionId: string
): Promise<void> {
  let deleted: boolean
  try {
    deleted = await deleteSession({ cwd: context.cwd, sessionId })
  } catch (error) {
    if (isUnsafeSessionError(error)) {
      writeJson(response, 400, { error: 'Invalid session id.' })
      return
    }
    throw error
  }
  if (!deleted) {
    writeJson(response, 404, { error: 'Session not found.' })
    return
  }
  writeJson(response, 200, { deleted: true })
}
```

- [ ] **Step 4: Run API tests**

Run:

```bash
npm test -- tests/web-server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit API changes**

```bash
git add src/web/server.ts tests/web-server.test.ts
git commit -m "feat: expose session pin and delete api"
```

---

### Task 3: Static UI Session Menu and Theme Hooks

**Files:**
- Modify: `src/web/static/index.html`
- Modify: `src/web/static/app.js`
- Test: `tests/web-server.test.ts`

- [ ] **Step 1: Add failing static UI assertions**

In the `serves the static shell from GET /` test, add:

```typescript
    expect(body).toContain('id="themeToggle"')
    expect(body).toContain('aria-label="Switch to dark mode"')
    expect(body).toContain('class="rail-avatar-image"')
```

In the test that reads `/static/app.js`, add:

```typescript
    expect(body).toContain('themeToggle')
    expect(body).toContain('localStorage.getItem(THEME_STORAGE_KEY)')
    expect(body).toContain('setTheme(nextTheme)')
    expect(body).toContain('openSessionMenuId')
    expect(body).toContain('deleteSession(session.id)')
    expect(body).toContain('toggleSessionPinned(session)')
    expect(body).toContain('session-menu')
    expect(body).toContain('session-menu-button')
    expect(body).toContain('session-action danger')
    expect(body).toContain('createIcon(')
    expect(body).not.toContain('preview.className = \\'session-preview\\'')
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/web-server.test.ts
```

Expected: FAIL because the new theme and menu strings are absent.

- [ ] **Step 3: Update `index.html` controls**

In `src/web/static/index.html`, replace the collapsed expand button content:

```html
          <button id="railSidebarToggle" class="rail-button rail-avatar-button" type="button" aria-label="Expand sidebar" aria-expanded="false" title="Expand sidebar">
            <img class="rail-avatar-image" src="/static/assets/cyrene-cartoon-avatar.png" alt="" decoding="async">
          </button>
```

Add the theme toggle before `inspectorEdgeToggle`:

```html
            <button id="themeToggle" class="theme-toggle icon-button icon-only" type="button" aria-label="Switch to dark mode" title="Switch to dark mode"></button>
            <button id="inspectorEdgeToggle" class="inspector-edge-toggle" type="button" aria-controls="inspector" aria-expanded="false" aria-label="Open inspector" title="Open inspector">
              <span aria-hidden="true">‹</span>
            </button>
```

- [ ] **Step 4: Update `app.js` state, theme, and menu rendering**

Add selectors/constants near the top:

```javascript
const themeToggle = document.querySelector('#themeToggle')
const THEME_STORAGE_KEY = 'cyrene.theme'
```

Extend `state`:

```javascript
  openSessionMenuId: null,
  theme: readStoredTheme(),
```

Call theme initialization after startup calls:

```javascript
setTheme(state.theme)
```

Add the theme listener:

```javascript
themeToggle?.addEventListener('click', () => {
  const nextTheme = state.theme === 'dark' ? 'light' : 'dark'
  setTheme(nextTheme)
})
```

Add a document click listener after other listeners:

```javascript
document.addEventListener('click', () => {
  if (state.openSessionMenuId !== null) {
    state.openSessionMenuId = null
    renderSessionList()
  }
})
```

Clear menu state in `resetChat`, `sendPrompt`, and `loadSession`:

```javascript
  state.openSessionMenuId = null
```

Replace `renderSessionList()` with a version that creates a row wrapper, a title button, and the selected-row menu:

```javascript
function renderSessionList() {
  if (!sessionHistory) {
    return
  }

  sessionHistory.replaceChildren()
  if (state.sessions.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'session-history-empty'
    empty.textContent = 'No saved sessions'
    sessionHistory.append(empty)
    return
  }

  const sessionLocked = isRunLocked()
  for (const session of state.sessions) {
    const row = document.createElement('div')
    row.className = 'session-row'
    row.classList.toggle('is-active', session.id === state.sessionId)

    const button = document.createElement('button')
    button.className = 'session-title-button'
    button.type = 'button'
    button.disabled = sessionLocked
    button.addEventListener('click', () => {
      state.openSessionMenuId = null
      void loadSession(session.id)
    })

    const title = document.createElement('span')
    title.className = 'session-title'
    title.textContent = session.title || 'Untitled session'
    button.append(title)
    row.append(button)

    if (session.id === state.sessionId) {
      row.append(renderSessionMenuTrigger(session, sessionLocked))
    }
    sessionHistory.append(row)
  }
}
```

Add these helper functions near `renderSessionList`:

```javascript
function renderSessionMenuTrigger(session, sessionLocked) {
  const wrapper = document.createElement('div')
  wrapper.className = 'session-menu-wrap'

  const button = document.createElement('button')
  button.className = 'session-menu-button'
  button.type = 'button'
  button.disabled = sessionLocked
  button.setAttribute('aria-label', `Open actions for ${session.title || 'Untitled session'}`)
  button.setAttribute('aria-expanded', String(state.openSessionMenuId === session.id))
  button.append(createIcon('dots'))
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    state.openSessionMenuId = state.openSessionMenuId === session.id ? null : session.id
    renderSessionList()
  })
  wrapper.append(button)

  if (state.openSessionMenuId === session.id) {
    wrapper.append(renderSessionMenu(session))
  }
  return wrapper
}

function renderSessionMenu(session) {
  const menu = document.createElement('div')
  menu.className = 'session-menu'
  menu.addEventListener('click', (event) => event.stopPropagation())

  const pinAction = document.createElement('button')
  pinAction.className = 'session-action'
  pinAction.type = 'button'
  pinAction.append(createIcon('pin'), document.createTextNode(session.pinned ? 'Unpin chat' : 'Pin chat'))
  pinAction.addEventListener('click', () => {
    void toggleSessionPinned(session)
  })

  const deleteAction = document.createElement('button')
  deleteAction.className = 'session-action danger'
  deleteAction.type = 'button'
  deleteAction.append(createIcon('trash'), document.createTextNode('Delete'))
  deleteAction.addEventListener('click', () => {
    void deleteSession(session.id)
  })

  menu.append(pinAction, deleteAction)
  return menu
}
```

Add API handlers:

```javascript
async function toggleSessionPinned(session) {
  if (isRunLocked()) {
    return
  }
  const response = await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pinned: !session.pinned })
  })
  state.openSessionMenuId = null
  if (response.ok) {
    await loadSessions()
  }
}

async function deleteSession(sessionId) {
  if (isRunLocked()) {
    return
  }
  const session = state.sessions.find((item) => item.id === sessionId)
  const title = session?.title || 'Untitled session'
  if (!window.confirm(`Delete "${title}"?`)) {
    return
  }
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
  state.openSessionMenuId = null
  if (!response.ok) {
    return
  }
  if (state.sessionId === sessionId) {
    resetChat()
  }
  await loadSessions()
}
```

Add theme helpers:

```javascript
function readStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function setTheme(theme) {
  state.theme = theme === 'dark' ? 'dark' : 'light'
  document.body.classList.toggle('theme-dark', state.theme === 'dark')
  try {
    localStorage.setItem(THEME_STORAGE_KEY, state.theme)
  } catch {
  }
  renderThemeToggle()
}

function renderThemeToggle() {
  if (!themeToggle) {
    return
  }
  const nextMode = state.theme === 'dark' ? 'light' : 'dark'
  themeToggle.replaceChildren(createIcon(state.theme === 'dark' ? 'sun' : 'moon'))
  themeToggle.setAttribute('aria-label', `Switch to ${nextMode} mode`)
  themeToggle.setAttribute('title', `Switch to ${nextMode} mode`)
}
```

Add `createIcon`:

```javascript
function createIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', '18')
  svg.setAttribute('height', '18')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.8')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const paths = {
    dots: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
    pin: ['M15 4.5l4.5 4.5', 'M14 5.5l-6.5 6.5', 'M12 15l-3 3', 'M7 12l5 5'],
    trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
    moon: ['M20 14.5A7.5 7.5 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z'],
    sun: ['M12 2v2', 'M12 20v2', 'M4.93 4.93l1.41 1.41', 'M17.66 17.66l1.41 1.41', 'M2 12h2', 'M20 12h2', 'M4.93 19.07l1.41-1.41', 'M17.66 6.34l1.41-1.41']
  }
  if (name === 'sun') {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    circle.setAttribute('cx', '12')
    circle.setAttribute('cy', '12')
    circle.setAttribute('r', '4')
    svg.append(circle)
  }
  for (const d of paths[name] || []) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}
```

- [ ] **Step 5: Run static UI tests**

Run:

```bash
npm test -- tests/web-server.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit static UI behavior**

```bash
git add src/web/static/index.html src/web/static/app.js tests/web-server.test.ts
git commit -m "feat: add session action menu and theme toggle"
```

---

### Task 4: Styling and Night Glass Theme

**Files:**
- Modify: `src/web/static/styles.css`
- Test: `tests/web-server.test.ts`

- [ ] **Step 1: Add failing CSS assertions**

In the `serves the Prism visual system from GET /static/styles.css` test, add:

```typescript
    expect(body).toContain('body.theme-dark')
    expect(body).toContain('--dark-panel')
    expect(body).toContain('.session-menu')
    expect(body).toContain('.session-action.danger')
    expect(body).toContain('.theme-toggle')
    expect(body).toContain('.rail-avatar-button')
    expect(body).toContain('.rail-avatar-image')
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- tests/web-server.test.ts
```

Expected: FAIL because the new selectors and dark tokens do not exist.

- [ ] **Step 3: Add session menu and icon styles**

In `src/web/static/styles.css`, replace the current session row block with styles that support title-only rows and a selected-row action menu:

```css
.session-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--ink);
  background: transparent;
}

.session-title-button {
  min-width: 0;
  padding: 10px 11px;
  color: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.session-row:hover,
.session-row.is-active {
  border-color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.58);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72), 0 9px 18px rgba(119, 139, 165, 0.1);
}

.session-title {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
}

.session-menu-wrap {
  position: relative;
  padding-right: 6px;
}

.session-menu-button,
.session-action {
  color: var(--ink);
  background: transparent;
  cursor: pointer;
}

.session-menu-button {
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 999px;
  place-items: center;
}

.session-menu-button:hover {
  background: rgba(255, 255, 255, 0.64);
}

.session-menu {
  position: absolute;
  z-index: 5;
  top: calc(100% + 5px);
  right: 4px;
  display: grid;
  gap: 4px;
  width: 142px;
  padding: 6px;
  border: 1px solid rgba(117, 139, 166, 0.22);
  border-radius: 14px;
  background: var(--panel-strong);
  box-shadow: 0 18px 38px rgba(83, 104, 132, 0.18);
}

.session-action {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
}

.session-action:hover {
  background: rgba(174, 239, 255, 0.22);
}

.session-action.danger {
  color: #a83a61;
}
```

- [ ] **Step 4: Add rail avatar and theme toggle styles**

Add:

```css
.rail-avatar-button {
  overflow: hidden;
  padding: 0;
}

.rail-avatar-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.theme-toggle {
  color: #7b6bd6;
}

body.theme-dark .theme-toggle {
  color: var(--warm);
}
```

- [ ] **Step 5: Add night glass theme variables and overrides**

Add after the base `body` block:

```css
body.theme-dark {
  --fog: #101520;
  --ice: #151d2b;
  --ink: #e6eef9;
  --muted: #a7b4c8;
  --line: rgba(177, 202, 232, 0.2);
  --panel: rgba(24, 31, 48, 0.72);
  --panel-strong: rgba(29, 38, 58, 0.9);
  --dark-panel: rgba(24, 31, 48, 0.72);
  color: var(--ink);
  background:
    radial-gradient(circle at 15% 10%, rgba(247, 168, 207, 0.16), transparent 32%),
    radial-gradient(circle at 82% 18%, rgba(93, 220, 255, 0.18), transparent 34%),
    radial-gradient(circle at 50% 96%, rgba(203, 189, 255, 0.18), transparent 32%),
    linear-gradient(135deg, #0f1724 0%, #161d2e 46%, #24192c 100%);
}

body.theme-dark .prism-light {
  background:
    linear-gradient(112deg, transparent 12%, rgba(174, 239, 255, 0.12) 30%, rgba(203, 189, 255, 0.12) 46%, transparent 62%),
    radial-gradient(circle at 58% 30%, rgba(255, 224, 130, 0.1), transparent 18%);
  opacity: 0.82;
}

body.theme-dark .glass-panel,
body.theme-dark .composer,
body.theme-dark .workspace-picker,
body.theme-dark .session-menu {
  border-color: rgba(177, 202, 232, 0.18);
  background: var(--panel);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

body.theme-dark .nav-action,
body.theme-dark .send-button {
  color: #eef6ff;
  background: linear-gradient(135deg, rgba(247, 168, 207, 0.34), rgba(93, 220, 255, 0.32));
}

body.theme-dark .session-row:hover,
body.theme-dark .session-row.is-active,
body.theme-dark .workspace-change-button:hover,
body.theme-dark .workspace-option:hover,
body.theme-dark .workspace-option.is-active,
body.theme-dark .icon-button,
body.theme-dark .rail-button,
body.theme-dark .inspector-edge-toggle {
  border-color: rgba(177, 202, 232, 0.18);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 10px 24px rgba(0, 0, 0, 0.18);
}

body.theme-dark #promptInput,
body.theme-dark .workspace-change-button,
body.theme-dark .workspace-option,
body.theme-dark .session-menu-button,
body.theme-dark .session-action {
  color: var(--ink);
}

body.theme-dark .message.assistant,
body.theme-dark .message.user,
body.theme-dark .message.status {
  background: rgba(255, 255, 255, 0.08);
}

body.theme-dark .message.error {
  border-color: rgba(208, 79, 131, 0.34);
  color: #f0a7c4;
  background: rgba(208, 79, 131, 0.12);
}

body.theme-dark .session-action.danger {
  color: #f0a7c4;
}
```

- [ ] **Step 6: Run CSS/static tests**

Run:

```bash
npm test -- tests/web-server.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit styling changes**

```bash
git add src/web/static/styles.css tests/web-server.test.ts
git commit -m "style: add cyrene night glass theme"
```

---

### Task 5: Full Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- tests/session-store.test.ts tests/web-server.test.ts
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

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git diff --stat HEAD~4..HEAD
git status --short
```

Expected: four implementation commits after the plan, and no unexpected tracked changes. Untracked local state such as `.cc-local/sessions/` may remain untouched.

---

## Self-Review Notes

- Spec coverage: Task 1 covers `pinned` persistence, sorting, legacy compatibility, and deletion storage. Task 2 covers Web API. Task 3 covers title-only rows, selected-row menu, confirmation deletion path, pin/unpin action, avatar rail expand, and localStorage theme hooks. Task 4 covers line-icon styling and the Cyrene-style night glass theme. Task 5 covers verification.
- Placeholder scan: This plan intentionally avoids open-ended placeholders; every code-changing step includes concrete snippets and exact commands.
- Type consistency: Store functions use `deleteSession({ cwd, sessionId })` and `updateSessionPinned({ cwd, sessionId, pinned })` consistently across tests, server routes, and frontend API calls.
