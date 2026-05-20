# Chat Start State and Workspace Switcher Design

## Goal

Refine the Web UI so a fresh chat starts with only a centered input surface, and simplify the left sidebar workspace selector into a single pill that opens a floating pill menu.

## Requirements

- In a fresh chat or after clicking New chat, the middle chat panel is hidden.
- The fresh-chat screen shows only one centered input box in the main area.
- The centered input must not overlap or visually compete with the left sidebar.
- The right Details toggle is hidden while the chat has not started.
- After the first message is sent, the full chat layout appears.
- Existing sessions with messages open directly into the full chat layout.
- The left-bottom workspace control is a single rounded pill showing the current workspace name, such as `workspace` or `project_a`.
- The workspace control does not show a separate `Change` label.
- Clicking the workspace pill opens a floating menu above it.
- The floating workspace menu uses compact pill/row options, matching the left sidebar selection feel.
- Workspace switching remains disabled while a prompt is being sent or a run is active.

## Non-Goals

- Do not change backend workspace validation or Markdown APIs.
- Do not change agent runtime workspace behavior.
- Do not add nested workspace selection.
- Do not add a visual heading above the fresh-chat input.
- Do not change the right Details panel content.

## UX Design

### Fresh Chat State

When there are no messages and no active run, the main area uses a start state. In this state, the usual chat shell elements are visually hidden: chat header, status line, message area, empty-state copy, composer dock, and inspector edge toggle. The only visible control in the main area is a centered prompt form.

The centered prompt form reuses the same underlying composer behavior as the normal chat composer. It accepts Enter to send and Shift+Enter for a newline. Sending the first message immediately moves the UI into the expanded chat state, appends the user message, and starts the run.

The start input is centered within the available main content area after the left sidebar and resize gutter are accounted for. It should not use absolute viewport positioning that can slide underneath the sidebar.

### Expanded Chat State

The expanded state is the current chat layout: header, status, message list, composer, and right Details toggle are visible. The UI enters this state when:

- the user sends the first message in a fresh chat,
- a run is active or being started,
- an existing session with messages is loaded.

Clicking New chat clears the session and messages, then returns to the fresh chat state.

### Workspace Pill

The workspace panel becomes a compact bottom control:

- The visible button text is the active workspace label shortened for display. For the root workspace, show `workspace`; for child workspaces, show the child folder name such as `project_a`.
- The button uses a rounded pill shape and centered text.
- The word `Change` is removed from the UI.
- Clicking the pill toggles a floating menu above the pill.
- Menu options are compact rows or pills. The active workspace is visually selected.
- Choosing a workspace closes the menu and refreshes Markdown context for the selected workspace.

Long workspace names are truncated with ellipsis inside the pill and menu rows.

## State Model

Use a small derived UI state instead of storing a separate mode when possible:

- `isFreshChat = state.messages.length === 0 && state.activeRun === null && !state.isSending`
- Fresh chat state is active when `isFreshChat` is true.
- Expanded chat state is active otherwise.

If the implementation needs a class hook, toggle a class such as `chat-not-started` on the app shell from this derived state.

Workspace menu open/closed state can continue using the existing `workspacePicker.hidden` behavior. The workspace lock remains derived from `state.isSending || state.activeRun !== null`.

## Component Changes

### HTML

Keep the existing workspace panel IDs so the current JavaScript wiring remains simple:

- `workspacePanel`
- `workspaceCurrent`
- `workspacePicker`

The current workspace control should become the clickable button itself. The existing `workspaceChangeButton` may be repurposed as the pill button if that keeps the diff small, but the visible label must be the workspace name rather than `Change`.

### JavaScript

- Render the active workspace name into the pill button.
- Keep the workspace picker disabled while locked.
- Toggle the app shell fresh/expanded class after:
  - reset chat,
  - sending starts,
  - final/error completes,
  - session loads,
  - messages render.
- Ensure the Details edge toggle is not visible in fresh chat state.
- Ensure first-send behavior transitions before or while appending the user message so the UI does not briefly keep the fresh-chat-only layout with a user bubble hidden.

### CSS

- Add a fresh-chat layout class that hides chat header, messages, and inspector edge toggle.
- Center the composer in the chat area while fresh.
- Keep the centered composer responsive within the available chat column.
- Restore the current docked composer placement in expanded state.
- Style workspace pill and floating picker as compact rounded controls.
- Avoid external panel shadows and hard divider artifacts.

## Error Handling

Workspace load and Markdown load errors continue to use existing messages. If workspaces fail to load, the pill can show `Workspace` or the existing error text, and it remains disabled when no workspace choices exist.

Sending errors still expand the chat state because there is now a visible user attempt and error message to show.

## Testing

Add focused coverage for:

- Static HTML no longer contains visible `Change` text for the workspace control.
- Static JavaScript includes the fresh-chat class/state update hook.
- Static CSS includes fresh-chat centering rules and hides the inspector edge toggle in fresh state.
- Existing workspace API and Markdown tests continue to pass.
- Existing Web run tests continue to pass.

Manual smoke check:

- Start Web UI.
- Confirm a fresh page or New chat shows only a centered input in the main area.
- Confirm the right Details toggle is hidden before the first message.
- Confirm sending the first message expands to the full chat layout.
- Confirm workspace pill opens the floating menu and selected workspace still controls Markdown context.

## Open Decisions

No unresolved decisions. The selected visual direction is:

- Fresh chat: only the centered input box.
- Workspace switcher: floating pill menu above the current workspace pill.
