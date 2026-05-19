# Cyrene Identity And Message Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current Prism web shell into a Cyrene-branded chat surface with a cleaner header/sidebar, removable avatar slots, and assistant replies that carry Cyrene identity without adding persistence or final image assets.

**Architecture:** Keep this as a static web UI refinement. Update the static contract tests first, then adjust `index.html`, `app.js`, and `styles.css` in narrow slices while preserving existing run API, SSE, keyboard, sidebar, and Inspector behavior.

**Tech Stack:** TypeScript, Vitest, static HTML/CSS/JavaScript served by `src/web/server.ts`.

---

## File Structure

- Modify `tests/web-server.test.ts`: update static HTML/CSS/JS contract checks from Prism wording to Cyrene identity, avatar hooks, removed session card, and assistant message identity hooks.
- Modify `src/web/static/index.html`: replace product labels, remove the bottom session card, add real/cartoony avatar placeholders, and keep existing IDs used by JavaScript.
- Modify `src/web/static/app.js`: render assistant messages with a Cyrene identity header and inner content wrapper; update empty-state copy to Cyrene.
- Modify `src/web/static/styles.css`: style realistic and cartoon avatar slots, remove dead sidebar-card styling, and center assistant message content inside its bubble.

Do not modify backend run APIs, model behavior, session storage, or generated image assets.

Verification commands use the bundled Node runtime because this machine may not have `node` or `npm` on `PATH`:

```bash
mkdir -p /tmp/project
/Users/phoenix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run tests/web-server.test.ts
/Users/phoenix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run
/Users/phoenix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc --noEmit
```

---

### Task 1: Update Static UI Contract Tests

**Files:**
- Modify: `tests/web-server.test.ts`

- [ ] **Step 1: Update HTML shell assertions**

In `tests/web-server.test.ts`, in `it('serves the static shell from GET /', ...)`, replace the existing UI identity expectations with this block after the content-type assertion:

```ts
expect(body).toContain('<title>Cyrene</title>')
expect(body).toContain('aria-label="Cyrene"')
expect(body).toContain('app.js')
expect(body).toContain('styles.css')
expect(body).toContain('id="sidebar"')
expect(body).toContain('id="messages"')
expect(body).toContain('id="inspector"')
expect(body).toContain('id="leftResizeHandle"')
expect(body).toContain('id="sidebarToggle"')
expect(body).toContain('id="sidebarRail"')
expect(body).toContain('id="railNewChatButton"')
expect(body).toContain('id="headerStatus"')
expect(body).toContain('id="inspectorEdgeToggle"')
expect(body).toContain('class="chat-actions"')
expect(body).toContain('class="brand-avatar avatar-realistic"')
expect(body).toContain('<h1>Cyrene</h1>')
expect(body).toContain('<h2>Untitled session</h2>')
expect(body).toContain('<h2>Cyrene</h2>')
expect(body).not.toContain('Prism Console')
expect(body).not.toContain('Local agent runs')
expect(body).not.toContain('Prism Web UI')
expect(body).not.toContain('Agent run console')
expect(body).not.toContain('Current session')
expect(body).not.toContain('Page-local chat')
expect(body).not.toContain('Messages stay in this tab.')
expect(body).not.toContain('class="sidebar-card"')
expect(body).not.toContain('href="#context"')
expect(body).not.toContain('href="#tools"')
expect(body).not.toContain('href="#chat">Console</a>')
expect(body).not.toContain('aria-label="Console"')
```

- [ ] **Step 2: Update CSS visual hook assertions**

In `it('serves the Prism visual system from GET /static/styles.css', ...)`, keep the existing prism background assertions and add Cyrene identity/style hooks:

```ts
expect(body).toContain('--pink: #f7a8cf')
expect(body).toContain('--warm: #ffe082')
expect(body).toContain('backdrop-filter')
expect(body).toContain('min-width: 1180px')
expect(body).toContain('.left-resize-handle')
expect(body).toContain('.inspector.is-open')
expect(body).toContain('.app-shell.sidebar-collapsed')
expect(body).toContain('.chat-actions')
expect(body).toContain('.inspector-edge-toggle')
expect(body).toContain('.run-status-line')
expect(body).toContain('.brand-avatar')
expect(body).toContain('.avatar-realistic')
expect(body).toContain('.assistant-avatar')
expect(body).toContain('.avatar-cartoon')
expect(body).toContain('.message-group.assistant')
expect(body).toContain('.message-content')
expect(body).toContain('@keyframes prismFocus')
expect(body).toContain('@keyframes statusFlow')
expect(body).toContain('linear-gradient(135deg, #e2eef9 0%, #f0f7ff 45%, #ffeaf6 100%)')
expect(body).toContain('box-shadow: none')
expect(body).not.toContain('.sidebar-card')
```

- [ ] **Step 3: Update JS interaction contract assertions**

In `it('serves refined Web UI interaction code from GET /static/app.js', ...)`, keep the existing interaction assertions and add assistant identity hooks:

```ts
expect(body).toContain('sidebarCollapsed')
expect(body).toContain('setSidebarCollapsed')
expect(body).toContain('setInspectorOpen')
expect(body).toContain('headerStatus')
expect(body).toContain('event.key === \'Enter\'')
expect(body).toContain('event.shiftKey')
expect(body).toContain('updateRunStatus(\'Thinking...\')')
expect(body).toContain('appendAssistantMessage')
expect(body).toContain('message-group assistant')
expect(body).toContain('assistant-avatar avatar-cartoon')
expect(body).toContain('message-content')
expect(body).toContain('Cyrene')
expect(body).not.toContain('Ask Prism')
```

- [ ] **Step 4: Run focused tests and confirm failure**

Run:

```bash
mkdir -p /tmp/project
/Users/phoenix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run tests/web-server.test.ts
```

Expected: FAIL because the static shell still contains old Prism wording, no avatar hooks, and the old simple assistant message renderer.

- [ ] **Step 5: Commit failing contract**

```bash
git add tests/web-server.test.ts
git commit -m "test: define cyrene web identity contract"
```

---

### Task 2: Update Static HTML Identity And Layout

**Files:**
- Modify: `src/web/static/index.html`
- Test: `tests/web-server.test.ts`

- [ ] **Step 1: Replace document and shell labels**

In `src/web/static/index.html`, replace:

```html
<title>Prism Console</title>
```

with:

```html
<title>Cyrene</title>
```

Then replace:

```html
<main class="app-shell" aria-label="Prism Console">
```

with:

```html
<main class="app-shell" aria-label="Cyrene">
```

- [ ] **Step 2: Replace the sidebar brand**

Replace the current `.brand` block:

```html
<div class="brand">
  <div class="brand-mark" aria-hidden="true"></div>
  <div>
    <h1>Prism Console</h1>
    <p>Local agent runs</p>
  </div>
</div>
```

with:

```html
<div class="brand">
  <div class="brand-avatar avatar-realistic" aria-hidden="true"></div>
  <div>
    <h1>Cyrene</h1>
  </div>
</div>
```

- [ ] **Step 3: Remove the bottom session card**

Delete this entire block from `src/web/static/index.html`:

```html
<section class="sidebar-card" aria-label="Session">
  <p class="eyebrow">Current session</p>
  <h2>Page-local chat</h2>
  <p>Messages stay in this tab.</p>
</section>
```

- [ ] **Step 4: Replace the chat header title**

Replace the current `.chat-title` content:

```html
<div class="chat-title">
  <p class="eyebrow">Prism Web UI</p>
  <h2>Agent run console</h2>
  <div class="run-status-row" aria-live="polite">
    <span id="headerStatus" class="run-status-text">Ready</span>
  </div>
  <div class="run-status-line" aria-hidden="true"></div>
</div>
```

with:

```html
<div class="chat-title">
  <h2>Untitled session</h2>
  <div class="run-status-row" aria-live="polite">
    <span id="headerStatus" class="run-status-text">Ready</span>
  </div>
  <div class="run-status-line" aria-hidden="true"></div>
</div>
```

- [ ] **Step 5: Update empty-state static copy**

Replace the static empty-state heading:

```html
<h3>Ask Prism to work through a local task.</h3>
```

with:

```html
<h3>Ask Cyrene to work through a local task.</h3>
```

- [ ] **Step 6: Update Inspector identity**

Replace the Inspector header title:

```html
<h2>Inspector</h2>
```

with:

```html
<h2>Cyrene</h2>
```

Keep the `Run details` eyebrow because it describes the right panel's function.

- [ ] **Step 7: Run focused tests**

Run:

```bash
mkdir -p /tmp/project
/Users/phoenix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run tests/web-server.test.ts
```

Expected: HTML identity assertions pass. CSS and JS assertions still fail until Tasks 3 and 4.

- [ ] **Step 8: Commit HTML identity changes**

```bash
git add src/web/static/index.html
git commit -m "feat: update cyrene shell identity"
```

---

### Task 3: Render Assistant Messages With Cyrene Identity

**Files:**
- Modify: `src/web/static/app.js`
- Test: `tests/web-server.test.ts`

- [ ] **Step 1: Replace `appendMessage` with assistant-aware rendering**

In `src/web/static/app.js`, replace the current `appendMessage(kind, text)` function with:

```js
function appendMessage(kind, text) {
  clearEmptyState()
  if (kind === 'assistant') {
    return appendAssistantMessage(text)
  }

  const node = document.createElement('article')
  node.className = `message ${kind}`
  node.setAttribute('aria-label', `${kind} message`)

  const content = document.createElement('span')
  content.className = 'message-content'
  content.textContent = text

  node.append(content)
  messages?.append(node)
  messages?.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' })
  return node
}
```

- [ ] **Step 2: Add the assistant message helper immediately after `appendMessage`**

Add:

```js
function appendAssistantMessage(text) {
  const group = document.createElement('article')
  group.className = 'message-group assistant'
  group.setAttribute('aria-label', 'Cyrene message')

  const header = document.createElement('div')
  header.className = 'message-identity'

  const avatar = document.createElement('span')
  avatar.className = 'assistant-avatar avatar-cartoon'
  avatar.setAttribute('aria-hidden', 'true')

  const name = document.createElement('span')
  name.className = 'message-author'
  name.textContent = 'Cyrene'

  const bubble = document.createElement('div')
  bubble.className = 'message assistant'

  const content = document.createElement('span')
  content.className = 'message-content'
  content.textContent = text

  header.append(avatar, name)
  bubble.append(content)
  group.append(header, bubble)
  messages?.append(group)
  messages?.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' })
  return group
}
```

- [ ] **Step 3: Update dynamic empty-state copy**

In `renderEmptyState()`, replace:

```js
'<h3>Ask Prism to work through a local task.</h3>',
```

with:

```js
'<h3>Ask Cyrene to work through a local task.</h3>',
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
mkdir -p /tmp/project
/Users/phoenix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run tests/web-server.test.ts
```

Expected: JS contract assertions pass. CSS assertions still fail until Task 4.

- [ ] **Step 5: Commit assistant rendering**

```bash
git add src/web/static/app.js
git commit -m "feat: render cyrene assistant messages"
```

---

### Task 4: Style Cyrene Avatars And Assistant Message Alignment

**Files:**
- Modify: `src/web/static/styles.css`
- Test: `tests/web-server.test.ts`

- [ ] **Step 1: Replace brand mark styling with avatar styling**

In `src/web/static/styles.css`, replace the `.brand-mark` rule with:

```css
.brand-avatar {
  position: relative;
  width: 46px;
  height: 46px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 18px;
  background:
    radial-gradient(circle at 52% 31%, rgba(255, 255, 255, 0.96) 0 8px, transparent 9px),
    radial-gradient(circle at 36% 42%, rgba(96, 62, 145, 0.86) 0 3px, transparent 4px),
    radial-gradient(circle at 62% 42%, rgba(96, 62, 145, 0.82) 0 3px, transparent 4px),
    linear-gradient(145deg, rgba(255, 183, 218, 0.96) 0 38%, rgba(222, 245, 255, 0.94) 39% 69%, rgba(205, 189, 255, 0.88) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.88), 0 10px 22px rgba(112, 133, 164, 0.16);
}

.brand-avatar::after {
  position: absolute;
  inset: 6px 5px auto auto;
  width: 16px;
  height: 26px;
  border-radius: 999px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.84), rgba(174, 239, 255, 0.26));
  content: "";
  transform: rotate(24deg);
}

.avatar-realistic {
  border-radius: 18px;
}
```

- [ ] **Step 2: Remove sidebar card styling**

Delete the `.sidebar-card` selector from this grouped selector:

```css
.brand h1,
.chat-header h2,
.inspector-header h2,
.sidebar-card h2,
.empty-state h3 {
```

so it becomes:

```css
.brand h1,
.chat-header h2,
.inspector-header h2,
.empty-state h3 {
```

Delete this grouped selector:

```css
.brand p,
.sidebar-card p,
.empty-state p,
.muted {
  color: var(--muted);
}
```

Replace it with:

```css
.brand p,
.empty-state p,
.muted {
  color: var(--muted);
}
```

Then delete these obsolete rules:

```css
.sidebar-card {
  display: flex;
  width: min(100%, 220px);
  min-height: 118px;
  flex-direction: column;
  justify-content: center;
  margin: auto auto 0;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.48);
}

.sidebar-card h2 {
  font-size: 15px;
}

.sidebar-card p {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.5;
}
```

- [ ] **Step 3: Add assistant group and avatar styles**

Replace the current `.message` block and `.message.assistant` block with this expanded message styling:

```css
.message-group {
  display: grid;
  gap: 8px;
  max-width: min(760px, 86%);
}

.message-group.assistant {
  align-self: flex-start;
}

.message-identity {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 4px;
  color: #59657a;
  font-size: 13px;
  font-weight: 700;
}

.assistant-avatar {
  position: relative;
  width: 30px;
  height: 30px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 34%, rgba(255, 255, 255, 0.95) 0 6px, transparent 7px),
    radial-gradient(circle at 38% 45%, rgba(101, 67, 154, 0.88) 0 2px, transparent 3px),
    radial-gradient(circle at 61% 45%, rgba(101, 67, 154, 0.82) 0 2px, transparent 3px),
    linear-gradient(145deg, rgba(255, 174, 214, 0.96), rgba(174, 239, 255, 0.88) 58%, rgba(203, 189, 255, 0.9));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82), 0 8px 18px rgba(117, 139, 166, 0.14);
}

.avatar-cartoon::after {
  position: absolute;
  right: 4px;
  bottom: 5px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgba(174, 239, 255, 0.9);
  content: "";
}

.message {
  display: flex;
  align-items: center;
  max-width: min(760px, 86%);
  min-height: 52px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: var(--panel-strong);
  box-shadow: 0 12px 30px rgba(106, 126, 150, 0.12);
  overflow-wrap: anywhere;
}

.message-content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.message.user {
  align-self: flex-end;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.86), rgba(247, 168, 207, 0.26));
}

.message.assistant {
  width: 100%;
  max-width: 100%;
  background: rgba(255, 255, 255, 0.88);
}
```

Keep the existing `.message.status` and `.message.error` rules after this block, then add this override immediately after `.message.error`:

```css
.message.status,
.message.error {
  display: block;
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
mkdir -p /tmp/project
/Users/phoenix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run tests/web-server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit CSS styling**

```bash
git add src/web/static/styles.css
git commit -m "style: add cyrene avatar message styling"
```

---

### Task 5: Full Verification And Browser QA

**Files:**
- Read: `src/web/static/index.html`
- Read: `src/web/static/app.js`
- Read: `src/web/static/styles.css`
- Read: `tests/web-server.test.ts`

- [ ] **Step 1: Run the full Vitest suite**

Run:

```bash
mkdir -p /tmp/project
/Users/phoenix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript typecheck**

Run:

```bash
/Users/phoenix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc --noEmit
```

Expected: no TypeScript errors.

- [ ] **Step 3: Start the web UI for manual QA**

Run:

```bash
/Users/phoenix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/tsx/dist/cli.mjs src/main.ts --web --port 4317
```

Expected terminal output:

```text
cc-local web listening at http://127.0.0.1:4317
```

- [ ] **Step 4: Browser QA checklist**

Open `http://127.0.0.1:4317` in the in-app browser and verify:

- The browser tab title is `Cyrene`.
- The left brand area shows the realistic placeholder avatar and `Cyrene`.
- The left bottom `Current session` card is gone.
- The center header shows `Untitled session`.
- `Prism Web UI`, `Agent run console`, `Prism Console`, and `Local agent runs` do not appear.
- The right Inspector opens and closes cleanly.
- The right Inspector header uses `Cyrene` while still showing run-details context.
- Collapsing and expanding the left sidebar still works.
- `New chat` still resets the page-local state when no run is active.
- Sending a prompt with `Enter` still works.
- `Shift + Enter` still inserts a newline.
- Assistant replies show the cartoon Cyrene avatar/name above the answer bubble.
- Assistant reply text is left-aligned and vertically centered inside the bubble.

- [ ] **Step 5: Stop the QA server**

Stop the server process with `Ctrl+C`.

- [ ] **Step 6: Check git status**

Run:

```bash
git status --short
```

Expected: no uncommitted files except intentional screenshots or QA artifacts. Delete or ignore local QA artifacts before merge.

---

## Implementation Notes

- Keep the final avatar images out of this pass. The CSS avatar classes are the integration points for future image assets.
- Do not add multi-session persistence or real session names. `Untitled session` is the only session placeholder for this pass.
- Do not reintroduce the old `Context`, `Tools`, `Console`, or bottom session-card navigation.
- Do not rename existing JavaScript IDs used by behavior: `newChatButton`, `railNewChatButton`, `sidebarToggle`, `railSidebarToggle`, `inspectorEdgeToggle`, `inspectorClose`, `headerStatus`, `promptInput`, and `sendButton`.
- Preserve the current run lifecycle: thinking/status in the header, final assistant output in the message stream, errors as error bubbles.

## Review And Merge

After all tasks pass:

```bash
git log --oneline -5
git status --short --branch
```

Expected:

- The task commits are present.
- The working tree is clean.
- The branch contains only the Cyrene identity/message changes from this plan plus the already-approved spec commit.
