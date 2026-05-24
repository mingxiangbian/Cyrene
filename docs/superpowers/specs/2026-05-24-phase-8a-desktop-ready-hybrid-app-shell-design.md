# Phase 8A Desktop-Ready Hybrid App Shell Design

## 状态

Draft for user review.

本 spec 定义 Phase 8A：

```txt
Desktop-ready Hybrid App Shell
```

Phase 8A 不是 Tauri 实现，也不是前端框架迁移。它先把 Cyrene 现有 Web UI 整理成可被桌面 App 包装的稳定产品界面：视觉上延续当前 Web UI，结构上明确 chat-first、run monitor、review/control surface 和 inspector detail 状态。

## 背景

Phase 7 已经把 Web UI 从聊天界面升级成 agent control console，并建立了 Tools、Memory、Affect、Trace 和 Evolution panels。现有前端仍是静态 HTML/CSS/vanilla JS：

```txt
src/web/static/index.html
src/web/static/styles.css
src/web/static/app.js
src/web/static/api-client.js
src/web/static/inspector.js
src/web/static/panels/*
```

Phase 8 roadmap 的原目标是 Tauri 桌面包装：

```txt
Tauri Shell
  -> starts local Cyrene server
  -> loads http://127.0.0.1:<port>
  -> Web UI talks to Cyrene API
```

但直接包装当前 Web UI 会把现有信息架构永久固化成桌面体验。Phase 8A 先做桌面化设计基准，Phase 8B 再做 Tauri 包装。

## 目标

Phase 8A 覆盖：

- 设计 desktop-ready Hybrid App Shell。
- 保留当前 sidebar / chat / inspector 三栏基础结构。
- 明确默认、运行中、审查和 detail inspector 四种状态。
- 以当前真实 Web UI 为视觉 source of truth。
- 允许在现有视觉语言内适度 polish。
- 固定 Figma / Browser / Computer Use 工作流。
- 给 Phase 8B Tauri 包装留下清晰边界。

## 非目标

Phase 8A 不做：

- 不实现 Tauri。
- 不迁移 React、Vite、Svelte 或其他前端框架。
- 不引入 Electron。
- 不写原生 Tauri UI。
- 不从零创建新设计系统。
- 不改变 Cyrene 视觉品牌方向。
- 不重构后端 API。
- 不改变 agent runtime、memory、affect、trace 或 evolution 行为。
- 不新增 Phase 7 之外的控制台能力。

## Visual Continuity Contract

当前 Web UI 是 Phase 8A 的视觉 source of truth。

Phase 8A 不重新设计 Cyrene 的视觉品牌。设计和实现必须继承当前 Web UI 的颜色、panel、圆角、组件密度和页面气质。用户看到桌面 App 时，第一反应应该是：

```txt
这是 Cyrene Web UI 的桌面版。
```

而不是：

```txt
这是另一个重新设计过的客户端。
```

### Canonical Tokens

Phase 8A 的 Figma 和实现检查必须从当前 `styles.css` tokens 出发：

```txt
--fog: #fbfdff
--ice: #eef8ff
--pink: #f7a8cf
--cyan: #aeefff
--lavender: #cbbdff
--warm: #ffe082
--glass-blue: #dff3ff
--ink: #243044
--muted: #667085
--line: rgba(117, 139, 166, 0.24)
--panel: rgba(255, 255, 255, 0.78)
--panel-strong: rgba(255, 255, 255, 0.9)

--radius-lg: 28px
--radius-md: 20px
--radius-sm: 14px

--sidebar-width: 280px
--sidebar-rail-width: 64px
--inspector-width: 320px
```

Existing layout constants remain the default:

```txt
body min-width: 1180px
app padding: 18px
grid gap: 12px
normal inspector: 320px
detail inspector: minmax(420px, 42vw)
```

### Components To Preserve

The desktop-ready design must preserve the component language of:

- Cyrene avatar and brand placement.
- `New chat` navigation action.
- Session / workspace sidebar.
- Chat header status.
- Centered empty-state composer.
- Think mode control.
- Context usage ring.
- Send button gradient.
- Inspector tabs.
- Glass panels and prism/fog background.

## Visual Polish Boundary

Phase 8A may polish Cyrene's current visual language, but it must not replace it.

Allowed polish:

- Improve color balance while staying within the existing fog/ice/pink/cyan/lavender/warm palette.
- Refine glass panel depth, line contrast, blur, and shadow.
- Improve spacing, typography, and visual hierarchy for desktop use.
- Improve button states: hover, active, disabled, danger, approval, rejected, and applied.
- Improve panel density for Tools, Memory, Affect, Trace, and Evolution.
- Make live run status, pending approval, high-risk action, and trace timeline easier to scan.
- Let Figma propose one or two refined variants that remain recognizably Cyrene.

Disallowed polish:

- Do not switch to a dark hard-edged control-console style.
- Do not replace the soft prism/glass identity.
- Do not introduce a new brand palette.
- Do not make the UI look like VS Code, Slack, or a generic admin dashboard.
- Do not replace the sidebar / chat / inspector structure.
- Do not make desktop UI visually diverge from the Web UI.

Acceptance phrase:

```txt
First glance: this is Cyrene.
Second glance: it is more mature and desktop-ready than the Web prototype.
```

## Hybrid App Shell Behavior

Phase 8A chooses Hybrid over pure chat-first or control-console-first.

Cyrene's normal experience remains chat-first, because the user primarily interacts with a personal agent through conversation. But Cyrene is not a generic chat wrapper; memory, trace, tools, affect and controlled evolution must become visible when they matter.

### Default State

```txt
Sidebar + Chat + optional narrow Inspector
```

- Chat remains the main workspace.
- Sidebar remains the home for session and workspace context.
- Inspector may be closed by default.
- Composer, Think mode, Context ring and Send behavior continue from the current Web UI.
- Header shows the minimum useful state when inspector is closed.

### Running State

```txt
Inspector becomes live run monitor
```

During an active run, inspector can show:

- Current run status.
- Tool activity.
- Trace summary.
- Cost and duration summary when available.
- High-risk tool confirmation.
- Cancellation state.

If inspector is closed, the chat header still shows the minimum run status. High-risk approval or blocking states may open or highlight the inspector, because those require user action.

### Review State

```txt
Inspector expands into control surface
```

Review posture is triggered by:

- Memory delete, downrank, or correction.
- Affect correction.
- Evolution proposal approve, reject, or apply.
- Prompt proposal apply.
- Trace detail review.
- Tool enable/disable or high-risk tool approval.

The existing inspector sizing model remains:

```txt
normal inspector: 320px
detail inspector: minmax(420px, 42vw)
```

When detail inspector opens, it should feel like the same glass inspector expanded into a working surface, not a separate page.

### Desktop State

```txt
Tauri wraps the same Web shell
```

Tauri must not introduce a second native UI. It should:

- Start the local Cyrene server.
- Load the Web shell from localhost.
- Provide native window, tray, menu, and permission bridge behavior.
- Leave runtime, tools, memory, trace, affect and evolution in the Node/TypeScript backend.

## Tooling Workflow

Phase 8 uses three main tools.

### Figma For Design

Figma is used to design structure and component rules from the existing Web UI.

Inputs:

```txt
current styles.css tokens
current index.html structure
current real Web UI screenshots
Phase 7 control console panels
```

Outputs:

```txt
Desktop-ready Hybrid App Shell
normal inspector state
detail inspector state
running/live monitor state
review/control state
component rules based on current Web style
```

Figma must not invent a new brand. It should organize and polish the existing Cyrene UI into a reliable desktop-ready spec.

### Browser For Web Verification

Browser is the main Phase 8A verification tool because the shipped shell remains Web UI.

Browser checks:

- Desktop viewport screenshot.
- Sidebar open/collapsed.
- Inspector closed/open.
- Detail inspector expansion.
- Chat-first empty state.
- Running state.
- Proposal review state.
- Tools / Memory / Affect / Trace / Evolution panels.
- Text wrapping.
- Overlap and clipping.

### Computer Use For Tauri Acceptance

Computer Use is reserved for Phase 8B after a Tauri app exists.

Computer Use checks:

- App launch.
- Local server startup.
- Window restore, close, and quit behavior.
- Tray behavior.
- Menu commands.
- Permission dialog or approval bridge.
- External link behavior.

Computer Use is not a design tool for Phase 8A.

## Scope

Phase 8A deliverables:

1. Figma-based desktop-ready shell design.
2. Visual continuity rules from current Web UI.
3. Hybrid shell behavior for default, running, review and detail states.
4. Component/state rules for inspector panels and high-risk actions.
5. Browser verification checklist for later implementation.

Phase 8A does not need to produce production code. Implementation planning begins only after this design is reviewed.

## Acceptance Criteria

Design acceptance:

```txt
[ ] Figma design is based on current Web UI tokens, screenshots and DOM structure.
[ ] Design includes chat-first default state.
[ ] Design includes inspector closed/open state.
[ ] Design includes detail inspector / review posture.
[ ] Design includes running state / live run monitor.
[ ] Design includes pending approval / high-risk action state.
[ ] Design preserves Cyrene's current visual identity.
[ ] Design includes limited polish that still feels like Cyrene.
```

Implementation acceptance for the future Phase 8A plan:

```txt
[ ] Browser screenshot proves Web UI still reads as Cyrene.
[ ] Desktop viewport has no text overflow or incoherent overlap.
[ ] Sidebar collapsed/open works.
[ ] Inspector normal/detail works.
[ ] Chat-first empty state works.
[ ] Tools/Memory/Affect/Trace/Evolution panels remain scannable and operable.
[ ] High-risk action hierarchy is visually clear.
```

Phase 8B acceptance:

```txt
[ ] Tauri app starts local server.
[ ] Tauri window loads the Web shell.
[ ] Close, tray, menu, external link and quit behavior are defined.
[ ] Computer Use verifies real desktop behavior.
```

## Risks

Risk: Desktop polish changes the product identity.

Mitigation: Treat current Web UI tokens and screenshots as the visual source of truth. Figma variants must explain how they preserve the existing identity.

Risk: Figma design becomes too ambitious for the current vanilla JS/CSS frontend.

Mitigation: Phase 8A may improve layout and states, but it must stay implementable with the existing static Web stack unless a later spec explicitly approves migration.

Risk: Tauri work starts before Web shell behavior is stable.

Mitigation: Keep Phase 8A and Phase 8B separate. Tauri begins only after the desktop-ready Web shell design is reviewed and implementation plan is approved.

Risk: Inspector becomes too heavy for normal conversation.

Mitigation: Default remains chat-first. Inspector expands only for running, review, trace, tool, memory, affect or evolution tasks that require attention.

## Next Step

After this spec is reviewed, invoke the implementation-planning workflow for Phase 8A. The next plan should start with Figma design work, then Browser-based Web verification. It should not start Tauri implementation.
