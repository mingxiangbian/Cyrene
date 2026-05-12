import { describe, expect, it, vi } from 'vitest'
import { createDefaultConfig } from '../src/config.js'
import type { CallModelInput, ChatMessage, ModelResponse } from '../src/llm-client.js'
import { runReplTurn } from '../src/repl.js'

describe('runReplTurn', () => {
  it('returns final text and preserves history across turns', async () => {
    const messages: ChatMessage[] = [{ role: 'system', content: 'system rules' }]
    const seenMessages: ChatMessage[][] = []
    let callCount = 0
    const callModel = vi.fn(async ({ messages: modelMessages }: CallModelInput): Promise<ModelResponse> => {
      seenMessages.push([...modelMessages])
      callCount += 1
      return { content: callCount === 1 ? 'hello back' : 'second answer', toolCalls: [] }
    })

    const result = await runReplTurn({
      config: createDefaultConfig('/tmp/project'),
      messages,
      input: 'hello',
      tools: [],
      callModel
    })

    expect(result).toEqual({ exit: false, finalText: 'hello back', toolCallCount: 0 })
    expect(callModel).toHaveBeenCalledTimes(1)
    expect(seenMessages[0]).toEqual([
      { role: 'system', content: 'system rules' },
      { role: 'user', content: 'hello' }
    ])
    expect(messages).toEqual([
      { role: 'system', content: 'system rules' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hello back' }
    ])

    const secondResult = await runReplTurn({
      config: createDefaultConfig('/tmp/project'),
      messages,
      input: 'again',
      tools: [],
      callModel
    })

    expect(secondResult).toEqual({ exit: false, finalText: 'second answer', toolCallCount: 0 })
    expect(seenMessages[1]).toEqual([
      { role: 'system', content: 'system rules' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hello back' },
      { role: 'user', content: 'again' }
    ])
  })

  it.each(['exit', 'quit', 'q'])('treats %s as exit intent without calling the model', async (input) => {
    const messages: ChatMessage[] = [{ role: 'system', content: 'system rules' }]
    const callModel = vi.fn(
      async (_input: CallModelInput): Promise<ModelResponse> => ({ content: 'unused', toolCalls: [] })
    )

    const result = await runReplTurn({
      config: createDefaultConfig('/tmp/project'),
      messages,
      input,
      tools: [],
      callModel
    })

    expect(result).toEqual({ exit: true })
    expect(callModel).not.toHaveBeenCalled()
    expect(messages).toEqual([{ role: 'system', content: 'system rules' }])
  })
})
