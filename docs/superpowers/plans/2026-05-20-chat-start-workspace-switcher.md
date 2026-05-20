# Chat Start Workspace Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fresh-chat Web UI state with only a centered input, and replace the left-bottom workspace `Change` control with a current-workspace pill that opens a floating pill menu.

**Architecture:** Keep backend workspace/session behavior unchanged. Reuse the existing composer, workspace picker, and DOM IDs, then add one derived UI state hook (`chat-not-started`) on `.app-shell` to switch between start and expanded layouts. Keep the workspace selector as a single button whose label is rendered from the selected workspace, with CSS repositioning the existing picker as a floating menu.

**Tech Stack:** Browser DOM APIs, static HTML/CSS/JS, TypeScript HTTP server tests, Vitest.

---

## File Structure

- Modify `src/web/static/index.html`
  - Remove visible `Change` copy from the workspace control while preserving `id="workspaceChangeButton"` and `aria-controls="workspacePicker"`.
- Modify `src/web/static/app.js`
  - Add derived fresh-chat UI state updates.
  - Render the selected workspace display name into the workspace pill button.
  - Keep workspace menu locking and Markdown refresh behavior unchanged.
- Modify `src/web/static/styles.css`
  - Add `.app-shell.chat-not-started` rules for centered input-only start state.
  - Restyle workspace button and picker as pill + floating menu.
- Modify `tests/web-server.test.ts`
  - Update static HTML/CSS/JS assertions for the new UI hooks and removal of `Change`.

## Task 1: Static Shell Markup

**Files:**
- Modify: `src/web/static/index.html`
- Modify: `tests/web-server.test.ts`

- [ ] **Step 1: Write failing HTML assertions**

In `tests/web-server.test.ts`, update the `serves the static shell from GET /` test by adding assertions near the existing workspace checks:

```ts
expect(body).toContain('id="workspaceChangeButton"')
expect(body).toContain('aria-controls="workspacePicker"')
expect(body).not.toContain('>Change</button>')
```

Keep the existing `workspaceCurrent`, `workspacePicker`, and `workspacePanel` assertions.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
/Users/phoenix/.local/bin/npm test -- tests/web-server.test.ts -t "serves the static shell"
```

Expected: FAIL because the current HTML still contains `>Change</button>`.

- [ ] **Step 3: Remove visible Change copy from the workspace button**

In `src/web/static/index.html`, replace:

```html
<button id="workspaceChangeButton" class="workspace-change-button" type="button" aria-expanded="false" aria-controls="workspacePicker">Change</button>
```

with:

```html
<button id="workspaceChangeButton" class="workspace-change-button" type="button" aria-expanded="false" aria-controls="workspacePicker"></button>
```

Do not remove `workspaceCurrent`; Task 2 can keep it as a hidden/accessibility helper or stop rendering visible content through CSS.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
/Users/phoenix/.local/bin/npm test -- tests/web-server.test.ts -t "serves the static shell"
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/web/static/index.html tests/web-server.test.ts
git commit -m "feat: simplify workspace switcher markup"
```

## Task 2: Fresh Chat State and Workspace Pill Behavior

**Files:**
- Modify: `src/web/static/app.js`
- Modify: `tests/web-server.test.ts`

- [ ] **Step 1: Write failing JavaScript marker assertions**

In `tests/web-server.test.ts`, update `serves refined Web UI interaction code from GET /static/app.js` with these assertions near existing workspace and chat assertions:

```ts
expect(body).toContain('isFreshChat')
expect(body).toContain('updateChatLayoutState')
expect(body).toContain("appShell?.classList.toggle('chat-not-started'")
expect(body).toContain('formatWorkspaceDisplayName')
expect(body).toContain('workspaceChangeButton.textContent =')
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
/Users/phoenix/.local/bin/npm test -- tests/web-server.test.ts -t "serves refined Web UI interaction code"
```

Expected: FAIL because the new helper functions and class toggle do not exist.

- [ ] **Step 3: Add the fresh-chat derived state helpers**

In `src/web/static/app.js`, add these functions near `isWorkspaceLocked()`:

```js
function isFreshChat() {
  return state.messages.length === 0 && state.activeRun === null && !state.isSending
}

function updateChatLayoutState() {
  appShell?.classList.toggle('chat-not-started', isFreshChat())
}

function formatWorkspaceDisplayName(workspace) {
  if (!workspace) {
    return state.workspaceError || 'Workspace'
  }
  if (workspace.id === '') {
    return 'workspace'
  }
  return workspace.id
}
```

- [ ] **Step 4: Call the layout helper from all state transitions**

In `src/web/static/app.js`, add `updateChatLayoutState()` at these points:

```js
void loadWorkspaces()
void loadSessions()
updateChatLayoutState()
```

In `resetChat()`, after `setSending(false)` and before focusing the input:

```js
updateChatLayoutState()
```

In `sendPrompt()`, after pushing the user message and clearing the textarea, before `setSending(true)`:

```js
updateChatLayoutState()
```

In `finishRun(stream)`, after `setSending(false)`:

```js
updateChatLayoutState()
```

In `loadSession(sessionId)`, after assigning `state.messages` and before `renderMessages()`:

```js
updateChatLayoutState()
```

In `renderMessages()`, after the empty-state branch and after rendering messages:

```js
updateChatLayoutState()
```

In `setSending(isSending)`, after toggling `run-active`:

```js
updateChatLayoutState()
```

This is intentionally redundant at transition boundaries so New chat, first send, session load, and run completion all settle into the right layout.

- [ ] **Step 5: Render workspace name into the pill button**

Replace the top of `renderWorkspacePanel()` with this structure:

```js
function renderWorkspacePanel() {
  const workspaceLocked = isWorkspaceLocked()
  const current = state.workspaces.find((workspace) => workspace.id === state.workspaceId)
  const displayName = formatWorkspaceDisplayName(current)
  if (workspaceCurrent) {
    workspaceCurrent.textContent = displayName
  }
  if (workspaceChangeButton) {
    workspaceChangeButton.textContent = displayName
    workspaceChangeButton.title = current?.label || displayName
    workspaceChangeButton.disabled = workspaceLocked || state.workspaces.length === 0
    workspaceChangeButton.setAttribute('aria-label', `Workspace: ${displayName}`)
    workspaceChangeButton.setAttribute('aria-expanded', String(workspacePicker?.hidden === false))
  }
  if (!workspacePicker) {
    return
  }

  workspacePicker.replaceChildren()
  for (const workspace of state.workspaces) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'workspace-option'
    button.classList.toggle('is-active', workspace.id === state.workspaceId)
    button.disabled = workspaceLocked
    button.textContent = formatWorkspaceDisplayName(workspace)
    button.title = workspace.label
    button.addEventListener('click', () => {
      if (isWorkspaceLocked()) {
        return
      }
      state.workspaceId = workspace.id
      state.selectedMarkdownContent = ''
      markdownRequests.file += 1
      workspacePicker.hidden = true
      workspaceChangeButton?.setAttribute('aria-expanded', 'false')
      renderWorkspacePanel()
      void loadMarkdownFiles()
    })
    workspacePicker.append(button)
  }
}
```

This preserves the current lock, selection, Markdown invalidation, picker close, and Markdown reload behavior while changing only the visible labels.

- [ ] **Step 6: Run focused JavaScript test and verify it passes**

Run:

```bash
/Users/phoenix/.local/bin/npm test -- tests/web-server.test.ts -t "serves refined Web UI interaction code"
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/web/static/app.js tests/web-server.test.ts
git commit -m "feat: add fresh chat ui state"
```

## Task 3: CSS for Input-Only Start State and Floating Workspace Menu

**Files:**
- Modify: `src/web/static/styles.css`
- Modify: `tests/web-server.test.ts`

- [ ] **Step 1: Write failing CSS assertions**

In `tests/web-server.test.ts`, update `serves the Prism visual system from GET /static/styles.css` with these assertions near existing workspace and composer checks:

```ts
expect(body).toContain('.app-shell.chat-not-started')
expect(body).toContain('.app-shell.chat-not-started .chat-header')
expect(body).toContain('.app-shell.chat-not-started .messages')
expect(body).toContain('.app-shell.chat-not-started .inspector-edge-toggle')
expect(body).toContain('.app-shell.chat-not-started .composer')
expect(body).toMatch(/\.workspace-picker \{[\s\S]*position: absolute/)
expect(body).toMatch(/\.workspace-change-button \{[\s\S]*border-radius: 999px/)
```

- [ ] **Step 2: Run focused CSS test and verify it fails**

Run:

```bash
/Users/phoenix/.local/bin/npm test -- tests/web-server.test.ts -t "serves the Prism visual system"
```

Expected: FAIL because `.chat-not-started` CSS does not exist yet.

- [ ] **Step 3: Restyle workspace panel as a bottom pill with floating menu**

In `src/web/static/styles.css`, update the workspace styles to this shape:

```css
.workspace-panel {
  position: relative;
  display: grid;
  gap: 8px;
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid rgba(117, 139, 166, 0.18);
}

.workspace-current {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.workspace-change-button {
  width: 100%;
  min-width: 0;
  min-height: 38px;
  padding: 9px 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.68);
  border-radius: 999px;
  color: var(--ink);
  font-size: 12px;
  font-weight: 800;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.62);
  cursor: pointer;
}

.workspace-picker {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 5;
  display: grid;
  gap: 6px;
  max-height: 180px;
  min-width: 0;
  padding: 8px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 14px 34px rgba(40, 60, 80, 0.18);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
}

.workspace-option {
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--ink);
  font-size: 12px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: transparent;
  cursor: pointer;
}
```

Keep `.workspace-picker[hidden] { display: none; }` and the hover/active block.

- [ ] **Step 4: Add fresh-chat layout CSS**

In `src/web/static/styles.css`, add this block near the `.chat-shell` and `.composer` rules:

```css
.app-shell.chat-not-started .chat-shell {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  place-items: center;
  background: transparent;
  border-color: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.app-shell.chat-not-started .chat-header,
.app-shell.chat-not-started .messages,
.app-shell.chat-not-started .inspector-edge-toggle {
  display: none;
}

.app-shell.chat-not-started .composer {
  width: min(640px, calc(100% - 48px));
  margin: 0;
}
```

Do not hide the left sidebar. Do not use viewport-fixed positioning for the start composer.

- [ ] **Step 5: Run focused CSS test and verify it passes**

Run:

```bash
/Users/phoenix/.local/bin/npm test -- tests/web-server.test.ts -t "serves the Prism visual system"
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/web/static/styles.css tests/web-server.test.ts
git commit -m "style: center fresh chat composer"
```

## Task 4: Integration Verification and Smoke Test

**Files:**
- Modify only if verification reveals a bug in files changed by Tasks 1-3.

- [ ] **Step 1: Run targeted Web tests**

Run:

```bash
/Users/phoenix/.local/bin/npm test -- tests/web-server.test.ts tests/web-static-helpers.test.mjs tests/web-workspaces.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
/Users/phoenix/.local/bin/npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run full tests**

Run:

```bash
/Users/phoenix/.local/bin/npm test
```

Expected in a clean worktree: all tests pass. If run from the main repo while `.worktrees/` exists, Vitest may discover tests in both the main repo and worktree; the pass condition is still zero failures.

- [ ] **Step 4: Start the Web UI for manual smoke**

Run:

```bash
/Users/phoenix/.local/bin/npm run dev -- --web --port 0
```

Expected: command prints `cc-local web listening at http://127.0.0.1:<port>`.

- [ ] **Step 5: Smoke test the fresh-chat and workspace UI**

Open the printed URL and verify:

- Fresh page shows only the centered input in the main area.
- Chat header, empty-state copy, and Details toggle are hidden before first send.
- The centered input stays in the main column and does not overlap the left sidebar.
- Left-bottom workspace pill shows `workspace` or the active child folder name.
- Clicking the workspace pill opens a floating menu above it.
- Selecting a workspace closes the menu and keeps Markdown context loading behavior working.
- Sending the first message expands the full chat panel.
- Clicking New chat returns to input-only start state.

- [ ] **Step 6: Stop the Web UI**

Stop the dev server with Ctrl-C or kill the process listening on the printed port. Confirm no server remains running on that port:

```bash
lsof -ti tcp:<port> || true
```

Expected: no output.

- [ ] **Step 7: Commit any smoke-test fixes**

If smoke testing required a fix, commit it:

```bash
git add src/web/static/index.html src/web/static/app.js src/web/static/styles.css tests/web-server.test.ts
git commit -m "fix: polish fresh chat workspace ui"
```

If no fixes were needed, do not create an empty commit.
