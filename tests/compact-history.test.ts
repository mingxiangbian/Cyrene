import { describe, expect, it, vi } from 'vitest'
import { compactHistory } from '../src/context.js'
import type { ChatMessage } from '../src/llm-client.js'

describe('compactHistory', () => {
  it('returns messages unchanged and does not call summarize when under threshold', async () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'system rules' },
      { role: 'user', content: 'short request' }
    ]
    const summarize = vi.fn(async () => 'summary')

    const compacted = await compactHistory(messages, {
      thresholdTokens: 100,
      keepRecentRounds: 1,
      summarize
    })

    expect(compacted).toBe(messages)
    expect(summarize).not.toHaveBeenCalled()
  })

  it('compacts when over threshold, summarizes old messages, and keeps multiple recent rounds', async () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'system rules' },
      { role: 'user', content: 'old request' },
      { role: 'assistant', content: 'old answer' },
      { role: 'user', content: 'recent request 1' },
      { role: 'assistant', content: 'recent answer 1' },
      { role: 'user', content: 'recent request 2' },
      { role: 'assistant', content: 'recent answer 2' }
    ]
    const summarize = vi.fn(async (_text: string) => 'earlier summary')

    const compacted = await compactHistory(messages, {
      thresholdTokens: 1,
      keepRecentRounds: 2,
      summarize
    })

    expect(summarize).toHaveBeenCalledTimes(1)
    expect(summarize).toHaveBeenCalledWith('[user]: old request\n\n[assistant]: old answer')
    expect(compacted).toEqual([
      { role: 'system', content: 'system rules' },
      {
        role: 'user',
        content:
          '[Context from earlier in this conversation — the following is a summary generated when the token limit was reached. Use this as context for continuing the task.]\n\nearlier summary'
      },
      { role: 'user', content: 'recent request 1' },
      { role: 'assistant', content: 'recent answer 1' },
      { role: 'user', content: 'recent request 2' },
      { role: 'assistant', content: 'recent answer 2' }
    ])
  })

  it('includes tool call metadata and tool result ids in summarized messages', async () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'system rules' },
      { role: 'user', content: 'old request' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'read_file',
              arguments: '{"path":"src/context.ts"}'
            }
          }
        ]
      },
      {
        role: 'tool',
        content: 'file contents',
        tool_call_id: 'call_123'
      },
      { role: 'user', content: 'recent request' }
    ]
    const summarize = vi.fn(async (_text: string) => 'earlier summary')

    await compactHistory(messages, {
      thresholdTokens: 1,
      keepRecentRounds: 1,
      summarize
    })

    expect(summarize).toHaveBeenCalledTimes(1)
    const conversationText = summarize.mock.calls[0][0]
    expect(conversationText).toContain('[assistant]: ')
    expect(conversationText).toContain('call_123')
    expect(conversationText).toContain('read_file')
    expect(conversationText).toContain('{"path":"src/context.ts"}')
    expect(conversationText).toContain('[tool]: file contents')
    expect(conversationText).toContain('tool_call_id')
  })

  it('preserves system message as first message after compaction', async () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'system rules' },
      { role: 'user', content: 'old request' },
      { role: 'user', content: 'recent request' }
    ]

    const compacted = await compactHistory(messages, {
      thresholdTokens: 1,
      keepRecentRounds: 1,
      summarize: async () => 'earlier summary'
    })

    expect(compacted[0]).toEqual({ role: 'system', content: 'system rules' })
  })
})
