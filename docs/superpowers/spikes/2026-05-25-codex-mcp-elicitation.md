# Codex MCP Elicitation Spike

## Question

Can Cyrene force Codex app to show a native approve/reject popup for pending memory, similar to tool permission approval?

## Local Evidence

- `@modelcontextprotocol/sdk` documents elicitation support, including form elicitation and URL elicitation.
- The current Cyrene MCP server uses `McpServer.registerTool()` over stdio.
- The current Codex-visible Cyrene MCP integration exposes tools, but this project has no proven path that renders custom MCP elicitation as a Codex-native permission modal.
- Stop hook execution happens after an assistant turn, so it cannot interrupt the already-finished response with a permission-style prompt.

## Decision For Phase C-A

Use Codex chat-native approval as the primary path:

1. Pending memory is written to `pending.jsonl`.
2. Codex surfaces a pending review notice through `cyrene_continuity_get` or `cyrene_memory_propose`.
3. User explicitly replies approve or reject.
4. Codex calls `cyrene_memory_promote` or `cyrene_memory_reject`.

Native elicitation remains future work unless a later manual Codex app test proves structured elicitation is rendered as a suitable approve/reject UI.

## Fallback

If Codex app does not support custom MCP elicitation UI, Phase C-A still works through MCP tools and chat review.
