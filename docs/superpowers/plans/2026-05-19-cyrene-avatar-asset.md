# Cyrene Avatar Asset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace placeholder Cyrene avatars with generated realistic/cartoon assets and fix the adjacent message/composer spacing issues.

**Architecture:** Keep the Web UI as static HTML/CSS/JS. Add two PNG assets under `src/web/static/assets/`, reference the realistic image from the sidebar shell, create the assistant image dynamically in `app.js`, and keep visual behavior covered by static contract tests plus browser QA.

**Tech Stack:** Static HTML, vanilla JavaScript, CSS, Node HTTP static server, Vitest, TypeScript, built-in image generation.

---

## File Structure

- Create: `src/web/static/assets/cyrene-realistic-avatar.png`
  - Realistic pink-haired Cyrene portrait for the sidebar brand avatar.
- Create: `src/web/static/assets/cyrene-cartoon-avatar.png`
  - Minimal mascot face for assistant message identity.
- Modify: `src/web/static/index.html`
  - Replace the CSS-only sidebar avatar with an image-backed avatar and reduce the composer textarea to a single default row.
- Modify: `src/web/static/app.js`
  - Render the assistant avatar image and trim assistant display text so leading newlines do not create blank space.
- Modify: `src/web/static/styles.css`
  - Style image-backed avatars and fix composer placeholder vertical alignment.
- Modify: `src/web/server.ts`
  - Serve `.png` assets with `image/png`.
- Modify: `tests/web-server.test.ts`
  - Lock asset references, PNG serving, assistant text trimming, and composer default sizing.

---

### Task 1: Generate and Select Avatar Assets

**Files:**
- Create: `src/web/static/assets/cyrene-realistic-avatar.png`
- Create: `src/web/static/assets/cyrene-cartoon-avatar.png`

- [ ] **Step 1: Generate the realistic sidebar avatar**

Use the built-in image generation tool with this prompt:

```text
Create a square 1024x1024 realistic portrait avatar for an AI assistant named Cyrene.
The subject should look like a real person photographed for a premium technology product, not anime, not illustration, not semi-real painted character art.
Head-and-shoulders portrait, natural facial proportions, realistic skin texture, realistic pink long hair, believable violet or purple-tinted eyes, calm professional expression.
Styling: subtle future-tech fashion, translucent white-blue prism jacket or collar detail, soft pink/cyan/lavender/white palette, clean high-key studio lighting, gentle glass/prism glow.
Composition: centered, generous padding for rounded-square crop, clean soft background, no city scene, no text, no watermark, no logos, no decorative symbols, no clutter.
Avoid cosplay staging, exaggerated makeup, anime face structure, line art, plastic skin, and complex accessories.
```

- [ ] **Step 2: Inspect the generated realistic avatar**

Open the generated image visually. Accept it only if it first reads as a real human portrait with pink-hair Cyrene identity.

Reject and regenerate if any of these are true:

```text
- The face reads as anime or illustration.
- The skin is plastic or painted.
- The background has text, logo, city clutter, or symbols.
- The crop would cut off key facial features in a rounded square.
```

- [ ] **Step 3: Copy the selected realistic avatar into the app**

Run this immediately after accepting the realistic image:

```bash
mkdir -p src/web/static/assets
LATEST_IMAGE=$(find /Users/phoenix/.codex/generated_images -type f -name '*.png' -mmin -30 -print0 | xargs -0 ls -t | head -1)
cp "$LATEST_IMAGE" src/web/static/assets/cyrene-realistic-avatar.png
file src/web/static/assets/cyrene-realistic-avatar.png
```

Expected: `PNG image data` appears in the `file` output.

- [ ] **Step 4: Generate the cartoon assistant avatar**

Use the built-in image generation tool with this prompt:

```text
Create a square 1024x1024 minimal cartoon mascot face avatar for an AI assistant named Cyrene.
This is a small chat avatar and must stay readable at 30px.
Subject: simplified friendly face, pink hair silhouette, purple eyes, soft smile, very simple rounded shapes.
Style: clean app mascot icon, pastel pink/cyan/lavender/white palette, subtle glass highlight, crisp edges, no busy background.
Composition: centered head icon with generous padding for circular crop.
Strictly avoid full body, half-body sticker, detailed clothing, detailed braids, multiple accessories, stars, gems, background symbols, text, watermark, logos, and decorative clusters.
Use at most one or two soft highlights. Keep the design simple enough to identify at small size.
```

- [ ] **Step 5: Inspect the generated cartoon avatar**

Open the generated image visually. Accept it only if it is visibly simpler than the previous busy cartoon asset and remains legible as a tiny chat identity.

Reject and regenerate if any of these are true:

```text
- The image contains background stars, gems, symbols, or decorative clusters.
- The character is full-body or detailed half-body.
- Hair/clothing detail dominates the face.
- The face is hard to read when mentally scaled to 30px.
```

- [ ] **Step 6: Copy the selected cartoon avatar into the app**

Run this immediately after accepting the cartoon image:

```bash
mkdir -p src/web/static/assets
LATEST_IMAGE=$(find /Users/phoenix/.codex/generated_images -type f -name '*.png' -mmin -30 -print0 | xargs -0 ls -t | head -1)
cp "$LATEST_IMAGE" src/web/static/assets/cyrene-cartoon-avatar.png
file src/web/static/assets/cyrene-cartoon-avatar.png
```

Expected: `PNG image data` appears in the `file` output.

- [ ] **Step 7: Verify both assets are present**

Run:

```bash
ls -lh src/web/static/assets/cyrene-realistic-avatar.png src/web/static/assets/cyrene-cartoon-avatar.png
```

Expected: both files exist and are non-empty.

- [ ] **Step 8: Commit**

```bash
git add src/web/static/assets/cyrene-realistic-avatar.png src/web/static/assets/cyrene-cartoon-avatar.png
git commit -m "feat: add cyrene avatar assets"
```

---

### Task 2: Add Failing Static Contract Tests

**Files:**
- Modify: `tests/web-server.test.ts`

- [ ] **Step 1: Extend static shell expectations**

In `tests/web-server.test.ts`, inside `serves the static shell from GET /`, update the avatar and composer assertions to include:

```ts
    expect(body).toContain('class="brand-avatar avatar-realistic"')
    expect(body).toContain('class="brand-avatar-image"')
    expect(body).toContain('src="/static/assets/cyrene-realistic-avatar.png"')
    expect(body).toContain('rows="1"')
    expect(body).not.toContain('rows="3"')
```

- [ ] **Step 2: Extend CSS expectations**

In `serves the Prism visual system from GET /static/styles.css`, add:

```ts
    expect(body).toContain('.brand-avatar-image')
    expect(body).toContain('.assistant-avatar-image')
    expect(body).toContain('object-fit: cover')
    expect(body).toContain('line-height: 20px')
    expect(body).toContain('resize: none')
```

- [ ] **Step 3: Extend JavaScript expectations**

In `serves refined Web UI interaction code from GET /static/app.js`, add:

```ts
    expect(body).toContain('cyrene-cartoon-avatar.png')
    expect(body).toContain('text.trim()')
    expect(body).toContain('assistant-avatar-image')
```

- [ ] **Step 4: Add PNG serving test**

Add this test after the CSS-serving test:

```ts
  it('serves Cyrene PNG avatar assets from GET /static/assets', async () => {
    const server = await startServer()

    const realisticResponse = await fetch(`${server.url}/static/assets/cyrene-realistic-avatar.png`)
    const cartoonResponse = await fetch(`${server.url}/static/assets/cyrene-cartoon-avatar.png`)

    expect(realisticResponse.status).toBe(200)
    expect(realisticResponse.headers.get('content-type')).toContain('image/png')
    expect((await realisticResponse.arrayBuffer()).byteLength).toBeGreaterThan(1024)
    expect(cartoonResponse.status).toBe(200)
    expect(cartoonResponse.headers.get('content-type')).toContain('image/png')
    expect((await cartoonResponse.arrayBuffer()).byteLength).toBeGreaterThan(1024)
  })
```

- [ ] **Step 5: Run targeted tests and verify they fail**

Run:

```bash
mkdir -p /tmp/project && /Users/phoenix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run tests/web-server.test.ts
```

Expected: tests fail because the HTML, CSS, JS, and PNG content type have not been updated yet.

- [ ] **Step 6: Commit**

```bash
git add tests/web-server.test.ts
git commit -m "test: define cyrene avatar asset contract"
```

---

### Task 3: Wire Avatar Assets and PNG Content Type

**Files:**
- Modify: `src/web/static/index.html`
- Modify: `src/web/static/app.js`
- Modify: `src/web/server.ts`

- [ ] **Step 1: Replace the sidebar avatar placeholder**

In `src/web/static/index.html`, replace:

```html
              <div class="brand-avatar avatar-realistic" aria-hidden="true"></div>
```

with:

```html
              <div class="brand-avatar avatar-realistic" aria-hidden="true">
                <img class="brand-avatar-image" src="/static/assets/cyrene-realistic-avatar.png" alt="" decoding="async">
              </div>
```

- [ ] **Step 2: Reduce the default textarea rows**

In `src/web/static/index.html`, replace:

```html
          <textarea id="promptInput" name="prompt" rows="3" placeholder="Ask about this workspace or start a local agent run"></textarea>
```

with:

```html
          <textarea id="promptInput" name="prompt" rows="1" placeholder="Ask about this workspace or start a local agent run"></textarea>
```

- [ ] **Step 3: Render the assistant avatar image**

In `src/web/static/app.js`, inside `appendAssistantMessage`, after creating `avatar`, add:

```js
  const avatarImage = document.createElement('img')
  avatarImage.className = 'assistant-avatar-image'
  avatarImage.src = '/static/assets/cyrene-cartoon-avatar.png'
  avatarImage.alt = ''
  avatarImage.decoding = 'async'
```

Then replace:

```js
  const name = document.createElement('span')
```

with:

```js
  avatar.append(avatarImage)

  const name = document.createElement('span')
```

- [ ] **Step 4: Trim assistant display text**

In `appendAssistantMessage`, replace:

```js
  content.textContent = text
```

with:

```js
  content.textContent = text.trim()
```

Leave `state.messages.push({ role: 'assistant', content: event.text })` unchanged so the stored session message remains the model's raw output.

- [ ] **Step 5: Serve PNG files with the correct content type**

In `src/web/server.ts`, update `contentTypeFor`:

```ts
    case '.png':
      return 'image/png'
```

Place it between the `.js` case and `default`.

- [ ] **Step 6: Run targeted tests and verify they still fail on CSS**

Run:

```bash
mkdir -p /tmp/project && /Users/phoenix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run tests/web-server.test.ts
```

Expected: PNG and HTML/JS assertions pass, but CSS assertions fail until Task 4 updates styles.

- [ ] **Step 7: Commit**

```bash
git add src/web/static/index.html src/web/static/app.js src/web/server.ts
git commit -m "feat: wire cyrene avatar assets"
```

---

### Task 4: Update Avatar and Composer Styling

**Files:**
- Modify: `src/web/static/styles.css`

- [ ] **Step 1: Replace CSS-drawn sidebar avatar internals with image styling**

In `src/web/static/styles.css`, keep `.brand-avatar` dimensions, border, radius, overflow, and shadow, but replace its gradient background with:

```css
  background: rgba(255, 255, 255, 0.72);
```

Delete the `.brand-avatar::after` block entirely.

Add this block after `.brand-avatar`:

```css
.brand-avatar-image,
.assistant-avatar-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

- [ ] **Step 2: Replace CSS-drawn assistant avatar internals with image styling**

In `.assistant-avatar`, replace the gradient background with:

```css
  background: rgba(255, 255, 255, 0.76);
```

Delete the `.avatar-cartoon::after` block entirely.

- [ ] **Step 3: Tighten assistant text vertical spacing**

Keep `.message` as a flex container. Do not change `align-items: center`.

Confirm `.message-content` remains:

```css
.message-content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
```

The actual top-blank fix is the `text.trim()` display change from Task 3.

- [ ] **Step 4: Fix composer placeholder vertical alignment**

Replace the `#promptInput` block with:

```css
#promptInput {
  width: 100%;
  height: 42px;
  min-height: 42px;
  max-height: 150px;
  resize: none;
  overflow-y: auto;
  border: 0;
  border-radius: 999px;
  outline: none;
  padding: 11px 13px;
  color: var(--ink);
  line-height: 20px;
  background: transparent;
  box-shadow: none;
}
```

This makes the placeholder vertically centered in the default one-line state while preserving Shift+Enter text entry.

- [ ] **Step 5: Run targeted tests and verify they pass**

Run:

```bash
mkdir -p /tmp/project && /Users/phoenix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run tests/web-server.test.ts
```

Expected: all `tests/web-server.test.ts` tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/web/static/styles.css
git commit -m "style: polish cyrene avatar and composer spacing"
```

---

### Task 5: Full Verification and Browser QA

**Files:**
- No planned source edits.

- [ ] **Step 1: Run full tests**

Run:

```bash
mkdir -p /tmp/project && /Users/phoenix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/vitest/vitest.mjs run
```

Expected: all test files pass.

- [ ] **Step 2: Run TypeScript check**

Run:

```bash
/Users/phoenix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc --noEmit
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Clean generated daily log noise if tests append it**

Run:

```bash
git diff -- .cc-local/memory/daily.md
```

If the only changes are newly appended `[HH:MM] glob -> ok` lines from this verification run, remove only those appended lines. Do not modify any unrelated memory content.

- [ ] **Step 4: Start a fake Web QA server**

Run:

```bash
/Users/phoenix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/tsx/dist/cli.mjs -e "import { startWebServer } from './src/web/server.ts'; (async () => { const server = await startWebServer({ cwd: process.cwd(), host: '127.0.0.1', port: 4321, callModel: async () => ({ content: '\n\nCyrene QA response with leading newlines', toolCalls: [] }) }); console.log('qa web listening at ' + server.url); process.stdin.resume(); })().catch((error) => { console.error(error); process.exit(1); });"
```

Expected: `qa web listening at http://127.0.0.1:4321`.

- [ ] **Step 5: Browser QA default UI**

Open `http://127.0.0.1:4321` in the Codex in-app browser and verify:

```text
- Sidebar brand avatar shows the realistic image, not a CSS gradient placeholder.
- Empty composer placeholder is vertically centered inside the pill.
- New chat, sidebar collapse, and inspector open controls remain visible.
```

Take a screenshot for the final report.

- [ ] **Step 6: Browser QA assistant response**

In the browser:

```text
1. Type: hello spacing
2. Press Enter.
3. Wait for "Cyrene QA response with leading newlines".
```

Verify:

```text
- Assistant row shows the cartoon avatar image.
- The assistant bubble does not have a large blank area above the text.
- The displayed response starts directly with "Cyrene QA response..." despite the fake model returning two leading newlines.
- Shift+Enter still inserts a newline in the composer.
```

Take a screenshot for the final report.

- [ ] **Step 7: Stop the QA server**

Stop the server process with Ctrl-C in the running command session.

- [ ] **Step 8: Final status check**

Run:

```bash
git status --short --branch
```

Expected: clean worktree on the implementation branch.

---

## Plan Self-Review

Spec coverage:

- Realistic sidebar avatar: Task 1 generates/selects it; Task 3 wires it; Task 4 styles it; Task 5 visually verifies it.
- Minimal cartoon assistant avatar: Task 1 generates/selects it; Task 3 wires it; Task 4 styles it; Task 5 visually verifies it.
- Stable static asset paths: Tasks 1-3.
- Assistant leading whitespace: Tasks 2-3 and Task 5 fake response.
- Composer placeholder vertical centering: Tasks 2, 4, and 5.
- Existing behavior preservation: Task 5 checks sidebar, inspector, Enter, and Shift+Enter.

Placeholder scan:

- No `TBD`, `TODO`, or unspecified implementation steps.
- Generated image source paths are handled by deterministic `find ... -mmin -30 | ls -t | head -1` commands immediately after generation.

Type consistency:

- CSS classes match across tests, HTML, JS, and styles: `brand-avatar-image`, `assistant-avatar-image`, `avatar-realistic`, `avatar-cartoon`.
- Asset paths match across tests, HTML, JS, and browser QA: `/static/assets/cyrene-realistic-avatar.png`, `/static/assets/cyrene-cartoon-avatar.png`.
