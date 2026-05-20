# Workspace and Markdown Context Design

## Goal

Make `workspace/` the default operating area for Web agent runs, expose a simple workspace selector in the left sidebar, remove remaining heavy panel shadow/divider artifacts, and let the right-side Details Context tab preview Markdown files from the selected workspace.

## Scope

In scope:

- Treat `<repo>/workspace` as the base workspace root for the Web UI.
- Allow the active workspace to be either `workspace/` itself or a direct child directory under `workspace/`.
- Use the active workspace as the agent runtime `cwd` and writable root for Web runs.
- Add a compact Workspace block at the bottom of the expanded left sidebar.
- Let users choose Markdown files from the active workspace in `Details > Context`.
- Render selected `.md` file content in the Context tab.
- Remove visible external shadows and hard dark divider lines from expanded left and center panels.

Out of scope:

- Editing Markdown from the Context tab.
- Previewing non-Markdown files.
- Selecting folders outside `workspace/`.
- Per-workspace session-history partitioning.
- Migrating existing sessions.

## Workspace Model

The Web server keeps the repository root as its base directory, then derives:

- `workspaceRoot = <repo>/workspace`
- `activeWorkspace = workspaceRoot` by default

Allowed active workspaces are limited to:

- `workspaceRoot`
- direct child directories of `workspaceRoot`

The backend must validate all workspace selections. A submitted workspace path is accepted only if its canonical path is `workspaceRoot` or a direct child directory inside `workspaceRoot`. Absolute paths, `..` traversal, and symlink escapes are rejected.

When a run starts, the frontend sends the selected workspace identifier with the run request. The backend builds the agent runtime for that run with:

- `config.cwd = activeWorkspace`
- `config.writableRoots = [activeWorkspace]`

As a result, relative `file_read`, `file_write`, `file_edit`, `grep`, and `glob` calls default to the selected workspace and writes stay confined there.

## Left Sidebar UI

The expanded sidebar keeps the current structure:

- Cyrene brand
- `New chat`
- session history
- Workspace block at the bottom

The Workspace block is intentionally minimal:

- label: `Workspace`
- current value: `workspace` or `workspace/<child>`
- action: `Change`

It does not include explanatory helper text. Clicking `Change` opens a small selector listing only allowed workspaces. Workspace switching is disabled while an agent run is active.

The collapsed rail omits workspace details in this iteration. Users expand the sidebar before changing workspace.

## Details Context Tab

`Details > Context` becomes a Markdown preview surface.

The tab contains:

- a Markdown file chooser
- a rendered Markdown preview
- empty and error states

The file chooser lists only top-level `.md` files in the current active workspace. Recursive Markdown discovery is out of scope for this iteration. The selected file is sent to the backend by workspace-relative path, then validated against the active workspace before reading.

If the active workspace contains no Markdown files, the Context tab shows an empty state. If reading fails, the tab shows a readable error and does not affect the current chat or run.

Markdown rendering should be safe for local preview. HTML embedded in Markdown should be escaped or sanitized rather than injected raw.

## Visual Adjustments

The expanded left sidebar and center chat shell should not show visible external drop shadows. They retain:

- subtle border
- glass background
- light inner highlight where already consistent with the visual system

Hard or dark divider artifacts should be removed, including the dark line observed in the center panel mockup. Soft status decoration remains only when it uses a low-contrast gradient and no hard border.

Small controls can keep restrained shadows only where already needed for affordance, but large layout panels stay flat.

## API Shape

Add or extend Web endpoints along these lines:

- `GET /api/workspaces`
  - returns allowed workspaces under `workspaceRoot`
- `GET /api/workspaces/:workspaceId/markdown`
  - returns Markdown files for that workspace
- `GET /api/workspaces/:workspaceId/markdown/:filePath`
  - returns one validated Markdown file's source content
- `POST /api/runs`
  - accepts a workspace identifier and creates the run using that active workspace

The exact URL encoding can be adjusted during implementation, but the backend validation rules are required.

## Data Flow

1. Page load requests available workspaces.
2. Frontend selects the default active workspace.
3. Changing workspace updates the left sidebar and reloads Markdown choices for Context.
4. Starting a run sends the active workspace with the user message.
5. Backend validates the workspace and builds runtime for that workspace.
6. Selecting a Markdown file reads it through the backend and renders it in `Details > Context`.

## Error Handling

- Missing `workspace/`: return a clear Web API error. Do not silently fall back to the repository root.
- Invalid workspace: reject the request and show an error in the UI.
- Active run in progress: disable workspace switching.
- No Markdown files: show a Context empty state.
- Markdown read failure: show an inline Context error.
- Unsafe Markdown content: render as sanitized or escaped content.

## Testing

Backend tests:

- `GET /api/workspaces` includes `workspace/` and direct child directories only.
- Workspace validation rejects `../`, absolute paths, nested paths if only direct children are allowed, and symlink escapes.
- `POST /api/runs` builds the runtime with the selected active workspace as `config.cwd`.
- Markdown listing and read endpoints only expose `.md` files under the active workspace.
- Missing `workspace/` produces a clear error.

Frontend/static tests:

- The shell includes the Workspace block.
- The client fetches workspaces and sends the selected workspace in run creation.
- The Context tab includes Markdown chooser and preview behavior.
- Workspace switching is disabled while a run is active.
- Large panel styles avoid visible external shadows and hard dark dividers.

Existing file tool tests should remain valid because the tools already resolve relative paths from `config.cwd` and enforce `writableRoots`.
