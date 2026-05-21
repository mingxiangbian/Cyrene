# Agent Safety and Correctness Fixes Design

## Goal

Fix five concrete correctness and safety issues found during the agent codebase review without expanding into a broader security redesign.

Success criteria:

- `ask_user` stops the current agent loop and returns the clarification question to the caller.
- Web sessions cannot be resumed from a different workspace than the one they were created in.
- Dates shown to the model and daily memory use the local runtime timezone rather than UTC slicing.
- `file_read` follows the same workspace read boundary as the other local file tools.
- Web JSON request bodies have a bounded maximum size.
- Existing TypeScript checks and Vitest tests pass.

## Non-Goals

- Do not change prompt composition or add new prompt boundary text in this iteration.
- Do not introduce user-configurable permission prompts.
- Do not add workspace migration for existing sessions.
- Do not expose external read allowlists in the Web UI.
- Do not rewrite the tool registry or agent loop architecture.

## Clarification Tool Flow

`ask_user` is a terminal tool for a turn. The current implementation treats it like any other tool result and then calls the model again, which lets the model continue without a user answer.

The agent loop should special-case tools whose `needsUserInteraction` flag is true:

1. Execute the tool normally so existing observers receive tool start/result events.
2. Append the corresponding tool message to preserve transcript consistency.
3. Return immediately with the tool result content as `finalText`.
4. Do not call the model again in the same turn.
5. Do not append daily summary memory for a clarification-only turn.

This keeps the existing `RunAgentLoopResult` shape and avoids a larger API change. REPL and Web callers already display final text, so they can show `Question for user: ...` without new UI work.

## Session Workspace Binding

Web sessions should carry the workspace they belong to. A session created from the root workspace stores the root workspace id. A session created from a child workspace stores that child id.

Add `workspaceId` to `SessionIndexItem` as an optional field for backward compatibility:

```typescript
interface SessionIndexItem {
  id: string
  mode: SessionMode
  title: string
  preview: string
  createdAt: string
  updatedAt: string
  model: string
  pinned: boolean
  workspaceId?: string
}
```

Creation rules:

- Web session creation passes the validated workspace id into `createSession`.
- REPL session creation leaves `workspaceId` undefined.
- Existing sessions without `workspaceId` are treated as legacy sessions.

Resume rules:

- If a Web session has `workspaceId`, resume only when the request workspace id matches it.
- If a Web session is legacy and has no `workspaceId`, allow resume only with the default root workspace. This avoids silently mixing legacy sessions into child workspaces.
- If a request tries to resume a session from a different workspace, return HTTP 409 with a clear error.

No automatic migration is included. Existing sessions remain readable through the session endpoints.

## Local Time Formatting

The current date is generated with `toISOString().slice(0, 10)`, and daily summary timestamps use UTC getters. This can be wrong around local midnight.

Add small local-time formatting helpers:

- `formatLocalDate(date): YYYY-MM-DD`
- `formatLocalDateTime(date): YYYY-MM-DD HH:mm`

Use them in:

- `buildAgentRuntime` current date text.
- Daily summary entry timestamps.

The helper uses the JavaScript runtime timezone. It does not add a new timezone config option.

## Read Boundary

`file_read` should not read arbitrary absolute paths when the runtime is scoped to a workspace. Reads should be confined to configured readable roots, parallel to the current write boundary.

Extend `AppConfig` with:

```typescript
readableRoots: string[]
```

Default:

- `readableRoots = [cwd]`
- `writableRoots = [cwd]`

`file_read` behavior:

- Resolve relative paths from `config.cwd`.
- Canonicalize the target with `realpath`.
- Reject reads whose canonical path is outside `config.readableRoots`.
- Reject symlink escapes because canonical path validation catches them.
- Continue to track successfully read canonical paths for later edits.

`grep` and `glob` already confine results to `cwd`. They can keep their existing logic for this iteration. `file_write` and `file_edit` keep using `writableRoots`.

This intentionally narrows the original v1 behavior where reads could inspect outside the root. If future work needs external read-only inspection, it should add explicit readable roots rather than falling back to arbitrary absolute paths.

## Request Body Limit

The Web server should cap JSON body size before buffering unbounded chunks.

Add a constant in `src/web/server.ts`:

```typescript
const MAX_REQUEST_BODY_BYTES = 1_000_000
```

`readRequestBody` should count incoming bytes. If the body exceeds the limit, destroy or stop reading the request and reject with a typed body-too-large error. Routes that parse JSON return HTTP 413 for that error and keep returning HTTP 400 for malformed JSON.

This limit applies to JSON endpoints that currently use `readRequestBody`, including run creation and session patching.

## Error Handling

- `ask_user` tool execution failure remains an ordinary failed tool result and should not stop as a clarification unless the tool result is successful.
- Workspace mismatch returns 409, not 400, because the session exists but conflicts with the requested workspace.
- Unsafe session ids continue to return 400.
- File reads outside readable roots return a controlled tool failure, not an exception.
- Request bodies over the limit return `{ "error": "Request body too large." }`.

## Testing

Agent loop tests:

- A model response with an `ask_user` tool call returns the question immediately.
- The model is not called again after successful `ask_user`.
- Daily summary is not appended for the clarification-only turn.

Session and Web server tests:

- `createSession` stores `workspaceId` when provided.
- Existing index entries without `workspaceId` still load.
- Web run creation records the selected workspace on new sessions.
- Resuming a session in the same workspace succeeds.
- Resuming a session in a different workspace returns 409.
- Legacy sessions without `workspaceId` only resume from the root workspace.

Date tests:

- `buildAgentRuntime` formats local dates correctly for a time near local midnight.
- Daily summary entries use local date/time fields.

File read tests:

- Reading inside the configured readable root succeeds.
- Reading an absolute path outside the readable root fails.
- Reading through a symlink that resolves outside the readable root fails.

Web request tests:

- Oversized `/api/runs` JSON bodies return HTTP 413.
- Invalid JSON still returns HTTP 400.
- Normal request bodies continue to work.
