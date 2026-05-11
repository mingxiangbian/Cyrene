import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../src/config.js'
import { executeToolCall } from '../src/tools/index.js'
import type { Tool, ToolContext } from '../src/tools/types.js'

const echoTool: Tool<{ text: string }> = {
  name: 'echo',
  description: 'Echo text.',
  parameters: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
    additionalProperties: false
  },
  schema: z.object({ text: z.string() }),
  isReadonly: true,
  isDestructive: false,
  isConcurrencySafe: false,
  needsUserInteraction: false,
  async execute(args) {
    return { ok: true, content: args.text }
  }
}

function context(): ToolContext {
  return {
    config: createDefaultConfig('/tmp/project'),
    trackedFiles: new Set<string>()
  }
}

describe('executeToolCall', () => {
  it('executes a valid registered tool call', async () => {
    const result = await executeToolCall(
      { id: 'call-1', name: 'echo', argumentsText: '{"text":"hello"}' },
      [echoTool],
      context()
    )

    expect(result.ok).toBe(true)
    expect(result.content).toBe('hello')
  })

  it('rejects unknown tools', async () => {
    const result = await executeToolCall(
      { id: 'call-1', name: 'missing', argumentsText: '{}' },
      [echoTool],
      context()
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('Unknown tool: missing')
  })

  it('rejects invalid JSON arguments', async () => {
    const result = await executeToolCall(
      { id: 'call-1', name: 'echo', argumentsText: '{bad json' },
      [echoTool],
      context()
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('Invalid JSON arguments')
  })

  it('rejects arguments that fail schema validation', async () => {
    const result = await executeToolCall(
      { id: 'call-1', name: 'echo', argumentsText: '{"text":123}' },
      [echoTool],
      context()
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('Invalid arguments for tool echo')
  })
})
