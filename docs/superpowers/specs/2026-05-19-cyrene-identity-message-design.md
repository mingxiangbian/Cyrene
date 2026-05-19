# Cyrene Identity And Message Presentation Design

Date: 2026-05-19

## Goal

Refine the Prism web console into a clearer Cyrene-branded chat experience. The current shell already has the glassmorphism, prism background, compact left rail, hidden Inspector, and rounded composer direction. This pass focuses on identity and chat presentation:

- Remove remaining placeholder product labels that make the UI feel generic.
- Give the model a stable visible identity: `Cyrene`.
- Replace unused or visually noisy session blocks with a cleaner layout.
- Prepare avatar slots for a realistic profile avatar and a cartoon assistant message avatar.
- Make assistant replies sit cleanly in their message bubble without extra blank-looking vertical space.

## Scope

In scope:

- Static web UI markup in `src/web/static/index.html`.
- Client-side message rendering in `src/web/static/app.js`.
- Styling in `src/web/static/styles.css`.
- Focused automated assertions for the static UI contract where practical.
- Browser QA for desktop layout, collapsed sidebar behavior, Inspector toggle placement, and assistant message presentation.

Out of scope:

- Backend run API changes.
- Agent runtime or model behavior changes.
- Multi-session persistence.
- Real saved session names.
- Figma export automation.
- Final AI-generated avatar image assets.

## User-Approved Direction

Use the lightweight implementation path first:

- Do the UI structure now.
- Use placeholder avatar surfaces and stable CSS hooks.
- Do not block this pass on generating final avatar images.
- Keep the existing prism, glassmorphism, light neumorphism, rounded product UI direction.
- Use the uploaded pink-haired prism character image only as a style reference for an original Cyrene identity, not as a direct copy.

## Identity Changes

### Brand Area

The sidebar brand area should become Cyrene-focused:

- Replace `Prism Console` with `Cyrene`.
- Remove `Local agent runs` instead of replacing it with another long subtitle.
- Replace the current abstract brand mark with a realistic-avatar slot.
- The avatar slot should be implemented so a real image can be dropped in later without changing layout code.

Initial avatar implementation:

- Use a CSS-rendered placeholder or local neutral placeholder surface.
- Use colors inspired by the reference image: soft pink, icy cyan, lavender, white glass, and faint warm highlights.
- Keep the avatar professional and minimal; it should feel like an AI model identity, not a decorative illustration block.

### Session Title

The center chat header should describe the current conversation, not the product shell:

- Remove the `Prism Web UI` eyebrow.
- Replace `Agent run console` with `Untitled session`.
- Treat `Untitled session` as a placeholder until real session naming exists.
- Do not add session persistence in this pass.

### Inspector Title

Where the Inspector still shows the old product wording, use Cyrene wording:

- Replace `Prism Console` with `Cyrene`.
- Replace `Local agent runs` with a short Cyrene-oriented label only if the layout needs secondary text; otherwise remove the secondary text.
- Keep Inspector function focused on run details and tool activity.

## Sidebar Cleanup

Remove the bottom `Current session` card entirely.

Reasons:

- It duplicates future session identity work without real persistence.
- It adds visual weight in the left rail.
- The user explicitly wants it removed.

The sidebar should keep:

- Brand/avatar area.
- `New chat` action.
- Collapse and expand controls.

The sidebar should not reintroduce removed `Context`, `Tools`, or redundant `Console` navigation.

## Assistant Message Presentation

Assistant replies should gain a lightweight identity header similar to a chat app:

- Each assistant response shows the cartoon Cyrene avatar above or at the top edge of the assistant message group.
- The avatar should use a separate cartoon/chibi slot from the realistic brand avatar.
- The assistant name can be shown as `Cyrene` if it fits cleanly; otherwise the avatar alone is enough.
- User messages do not need an avatar in this pass.
- Error messages keep their existing error styling and do not need the Cyrene avatar.

Initial cartoon avatar implementation:

- Use a CSS-rendered circular placeholder with pink, cyan, and lavender prism accents.
- Use stable classes so a generated cartoon image can replace it later.
- Keep it small enough not to clutter the chat stream.

## Message Bubble Alignment

Assistant message content should feel vertically centered inside its bubble.

Requirements:

- Remove the blank-looking vertical gap in assistant replies.
- Keep text left-aligned for readability.
- Preserve multiline formatting with `white-space: pre-wrap`.
- Preserve long-word wrapping.
- Do not vertically center the whole message list; only center content within the assistant bubble when the bubble has extra height.

Implementation direction:

- Render assistant messages with an inner content element, such as `.message-content`.
- Use flex alignment on the assistant bubble or inner wrapper to center the content vertically.
- Keep user message layout simple and compatible with the existing stream.

## Visual Styling

Keep the current UI foundation:

- Deeper soft prism background selected in the previous polish.
- White translucent glass panels.
- Fine borders and inner highlights instead of heavy shadows.
- Rounded controls and card-like surfaces where they serve the layout.
- Clean spacing and grid alignment.

New identity styling should be restrained:

- Avatar slots should add recognizable character without becoming large hero art.
- Avoid noisy particles in this pass.
- Avoid adding new heavy shadows behind the sidebar or chat panel.
- Preserve the Apple-like, clean, futuristic, daily-use AI product feel.

## Interaction Behavior

No new backend or persistence behavior is required.

Existing behavior should remain:

- `New chat` resets the page-local message state when no run is active.
- Left sidebar expands and collapses.
- Right Inspector opens and closes.
- `Enter` sends.
- `Shift + Enter` inserts a newline.
- Thinking/status line remains in the header area.
- Assistant final output appears in the message stream.

## Accessibility

Requirements:

- Avatar images or decorative avatar placeholders should use `aria-hidden="true"` unless they convey necessary information.
- If the assistant name is visible, it should be normal text, not only encoded in an image.
- Existing icon-only buttons keep accessible labels.
- Status text remains `aria-live="polite"`.
- Message markup should remain readable in a screen reader: user and assistant messages should be distinguishable by text or semantic labels.

## Testing

Automated checks:

- Existing test suite should pass.
- TypeScript typecheck should pass.
- Static UI tests should be updated or added to assert:
  - `Current session` card is removed.
  - `Prism Web UI` is removed.
  - `Agent run console` is replaced by `Untitled session`.
  - `Prism Console` and `Local agent runs` no longer appear in the static shell.
  - `Cyrene` appears as the model identity.
  - Assistant message rendering includes stable avatar/message identity hooks.

Manual browser QA:

- Default layout shows a clean Cyrene brand area without the bottom session card.
- Center header shows `Untitled session` with no `Prism Web UI` eyebrow.
- Inspector still opens and closes cleanly.
- Sidebar collapse and expand still work.
- Assistant replies show the cartoon avatar treatment.
- Assistant message text is visually centered inside its bubble when extra vertical space exists.
- Existing composer keyboard behavior still works.

## Non-Goals

Do not:

- Build real multi-session history.
- Add session persistence.
- Generate final avatar assets in this pass.
- Copy the referenced character exactly.
- Reintroduce unused sidebar navigation.
- Add particles or large decorative identity art.
- Use heavy shadows to solve layout separation.
