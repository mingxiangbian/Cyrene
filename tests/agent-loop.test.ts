import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { runAgentLoop } from '../src/agent-loop.js'
import { createDefaultConfig } from '../src/config.js'
import type { ChatMessage, ModelResponse } from '../src/llm-client.js'
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

const failingWebSearchTool: Tool<{ query: string }> = {
  name: 'web_search',
  description: 'Failing web search.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query'],
    additionalProperties: false
  },
  schema: z.object({ query: z.string() }),
  isReadonly: true,
  isDestructive: false,
  isConcurrencySafe: false,
  needsUserInteraction: false,
  async execute() {
    return {
      ok: false,
      content: 'DuckDuckGo request failed: network down',
      metadata: { errorCode: 'network_error' }
    }
  }
}

describe('runAgentLoop', () => {
  it('returns assistant text when no tool calls are requested', async () => {
    const result = await runAgentLoop({
      config: createDefaultConfig('/tmp/project'),
      systemPrompt: 'system',
      userPrompt: 'hello',
      tools: [],
      callModel: async (): Promise<ModelResponse> => ({ content: 'final answer', toolCalls: [] })
    })

    expect(result.finalText).toBe('final answer')
  })

  it('executes tool calls and feeds the result back to the model', async () => {
    let calls = 0
    const seenMessages: ChatMessage[][] = []
    const result = await runAgentLoop({
      config: createDefaultConfig('/tmp/project'),
      systemPrompt: 'system',
      userPrompt: 'echo',
      tools: [echoTool],
      callModel: async ({ messages }): Promise<ModelResponse> => {
        calls += 1
        seenMessages.push([...messages])
        if (calls === 1) {
          return {
            content: '',
            toolCalls: [
              {
                id: 'call-1',
                type: 'function',
                function: { name: 'echo', arguments: '{"text":"tool output"}' }
              }
            ]
          }
        }
        return { content: 'done after tool', toolCalls: [] }
      }
    })

    expect(result.finalText).toBe('done after tool')
    expect(result.toolCallCount).toBe(1)
    expect(seenMessages[1]?.at(-1)).toEqual({
      role: 'tool',
      tool_call_id: 'call-1',
      content: 'tool output'
    })
  })

  it('asks the model for a final answer when it returns blank text after tools', async () => {
    let calls = 0
    const seenMessages: ChatMessage[][] = []
    const result = await runAgentLoop({
      config: createDefaultConfig('/tmp/project'),
      systemPrompt: 'system',
      userPrompt: 'echo',
      tools: [echoTool],
      callModel: async ({ messages }): Promise<ModelResponse> => {
        calls += 1
        seenMessages.push([...messages])
        if (calls === 1) {
          return {
            content: '',
            toolCalls: [
              {
                id: 'call-1',
                type: 'function',
                function: { name: 'echo', arguments: '{"text":"tool output"}' }
              }
            ]
          }
        }
        if (calls === 2) {
          return { content: '\n\n', toolCalls: [] }
        }
        return { content: 'final after retry', toolCalls: [] }
      }
    })

    expect(result.finalText).toBe('final after retry')
    expect(result.toolCallCount).toBe(1)
    expect(seenMessages[2]?.at(-1)).toEqual({
      role: 'user',
      content: 'Your previous response was empty. Provide a clear final answer using the tool results above, or call another tool if needed.'
    })
  })

  it('allows another blank final retry after new tool results', async () => {
    let calls = 0
    const result = await runAgentLoop({
      config: createDefaultConfig('/tmp/project'),
      systemPrompt: 'system',
      userPrompt: 'echo',
      tools: [echoTool],
      callModel: async (): Promise<ModelResponse> => {
        calls += 1
        if (calls === 1 || calls === 3) {
          return {
            content: '',
            toolCalls: [
              {
                id: `call-${calls}`,
                type: 'function',
                function: { name: 'echo', arguments: '{"text":"tool output"}' }
              }
            ]
          }
        }
        if (calls === 2 || calls === 4) {
          return { content: '\n\n', toolCalls: [] }
        }
        return { content: 'final after second retry', toolCalls: [] }
      }
    })

    expect(result.finalText).toBe('final after second retry')
    expect(result.toolCallCount).toBe(2)
  })

  it('persists only tool calls that receive tool messages when the turn budget is reached', async () => {
    const config = createDefaultConfig('/tmp/project')
    config.maxToolCallsPerTurn = 1
    const messages: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'echo' }
    ]

    const result = await runAgentLoop({
      config,
      messages,
      tools: [echoTool],
      callModel: async (): Promise<ModelResponse> => ({
        content: '',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'echo', arguments: '{"text":"first"}' }
          },
          {
            id: 'call-2',
            type: 'function',
            function: { name: 'echo', arguments: '{"text":"second"}' }
          }
        ]
      })
    })

    expect(result.toolCallCount).toBe(1)
    expect(messages).toContainEqual({
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'echo', arguments: '{"text":"first"}' }
        }
      ]
    })
    expect(messages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call-1',
      content: 'first'
    })
    expect(messages).not.toContainEqual({
      role: 'tool',
      tool_call_id: 'call-2',
      content: 'second'
    })
  })

  it('marks web search unavailable after consecutive failures in a session', async () => {
    const config = createDefaultConfig('/tmp/project')
    const messages: ChatMessage[] = [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'search' }
    ]
    const toolContext: ToolContext = { config, trackedFiles: new Set<string>() }
    let toolExecutions = 0
    const failingTool: Tool<{ query: string }> = {
      ...failingWebSearchTool,
      async execute(args, context) {
        toolExecutions += 1
        return failingWebSearchTool.execute(args, context)
      }
    }
    let calls = 0

    const result = await runAgentLoop({
      config,
      messages,
      tools: [failingTool],
      toolContext,
      callModel: async ({ messages: modelMessages }): Promise<ModelResponse> => {
        calls += 1
        if (calls <= 3) {
          return {
            content: '',
            toolCalls: [
              {
                id: `call-${calls}`,
                type: 'function',
                function: { name: 'web_search', arguments: '{"query":"latest docs"}' }
              }
            ]
          }
        }

        expect(modelMessages).toContainEqual({
          role: 'user',
          content: 'Web search has failed twice consecutively and appears unavailable. Use grep, glob, and file_read for local-only work. Do not call web_search again in this session.'
        })
        expect(modelMessages.at(-1)).toEqual({
          role: 'tool',
          tool_call_id: 'call-3',
          content: 'web_search is unavailable in this session; use local tools or ask the user to retry later.'
        })
        return { content: 'done without web', toolCalls: [] }
      }
    })

    expect(result.finalText).toBe('done without web')
    expect(toolExecutions).toBe(2)
  })
})
