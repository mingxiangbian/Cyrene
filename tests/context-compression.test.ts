import { describe, expect, it } from 'vitest'

import { snipMessages } from '../src/context.js'
import type { ChatMessage, ModelToolCall } from '../src/llm-client.js'

function toolCall(id: string, name = 'grep'): ModelToolCall {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: '{}'
    }
  }
}

describe('snipMessages', () => {
  it('removes old tool-only assistant and tool result while keeping old user', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'old request' },
      { role: 'assistant', content: '', tool_calls: [toolCall('call-old')] },
      { role: 'tool', tool_call_id: 'call-old', content: 'old tool output' },
      { role: 'user', content: 'recent request' },
      { role: 'assistant', content: 'recent answer' }
    ]

    expect(snipMessages(messages, 1)).toEqual([
      { role: 'user', content: 'old request' },
      { role: 'user', content: 'recent request' },
      { role: 'assistant', content: 'recent answer' }
    ])
  })

  it('keeps old assistant text but strips old tool calls and corresponding tool result', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'old request' },
      { role: 'assistant', content: 'I will inspect that.', tool_calls: [toolCall('call-old')] },
      { role: 'tool', tool_call_id: 'call-old', content: 'old tool output' },
      { role: 'user', content: 'recent request' },
      { role: 'assistant', content: 'recent answer' }
    ]

    expect(snipMessages(messages, 1)).toEqual([
      { role: 'user', content: 'old request' },
      { role: 'assistant', content: 'I will inspect that.' },
      { role: 'user', content: 'recent request' },
      { role: 'assistant', content: 'recent answer' }
    ])
  })

  it('preserves recent rounds unchanged including tool calls and tool result', () => {
    const recentToolCall = toolCall('call-recent', 'file_read')
    const messages: ChatMessage[] = [
      { role: 'user', content: 'old request' },
      { role: 'assistant', content: '', tool_calls: [toolCall('call-old')] },
      { role: 'tool', tool_call_id: 'call-old', content: 'old tool output' },
      { role: 'user', content: 'recent request' },
      { role: 'assistant', content: '', tool_calls: [recentToolCall] },
      { role: 'tool', tool_call_id: 'call-recent', content: 'recent tool output' },
      { role: 'assistant', content: 'recent answer' }
    ]

    expect(snipMessages(messages, 1)).toEqual([
      { role: 'user', content: 'old request' },
      { role: 'user', content: 'recent request' },
      { role: 'assistant', content: '', tool_calls: [recentToolCall] },
      { role: 'tool', tool_call_id: 'call-recent', content: 'recent tool output' },
      { role: 'assistant', content: 'recent answer' }
    ])
  })

  it('returns a new array and does not mutate input message objects', () => {
    const oldAssistant: ChatMessage = {
      role: 'assistant',
      content: 'I will inspect that.',
      tool_calls: [toolCall('call-old')]
    }
    const messages: ChatMessage[] = [
      { role: 'user', content: 'old request' },
      oldAssistant,
      { role: 'tool', tool_call_id: 'call-old', content: 'old tool output' },
      { role: 'user', content: 'recent request' }
    ]

    const snipped = snipMessages(messages, 1)

    expect(snipped).not.toBe(messages)
    expect(oldAssistant).toEqual({
      role: 'assistant',
      content: 'I will inspect that.',
      tool_calls: [toolCall('call-old')]
    })
    expect(snipped).toContainEqual({ role: 'assistant', content: 'I will inspect that.' })
  })
})
