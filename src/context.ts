import type { ChatMessage } from './llm-client.js'
import { estimateTokensForMessages } from './token-counter.js'

export interface CompactHistoryOptions {
  thresholdTokens: number
  keepRecentRounds: number
  summarize: (text: string) => string | Promise<string>
}

export function buildInitialMessages(systemPrompt: string, userPrompt: string): ChatMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ]
}

export function compactToolResult(content: string, maxLines: number): string {
  const lines = content.split(/\r?\n/)
  if (lines.length <= maxLines) {
    return content
  }

  const headCount = Math.max(1, Math.floor(maxLines * 0.6))
  const tailCount = Math.max(1, maxLines - headCount - 1)
  return [
    ...lines.slice(0, headCount),
    `[tool output compacted: ${lines.length} lines total]`,
    ...lines.slice(-tailCount)
  ].join('\n')
}

export function snipMessages(messages: ChatMessage[], keepRecentRounds: number): ChatMessage[] {
  const recentStart = recentRoundStart(messages, keepRecentRounds)
  const oldMessages = messages.slice(0, recentStart)
  const recentMessages = messages.slice(recentStart)
  const snippedOldMessages: ChatMessage[] = []

  for (const message of oldMessages) {
    if (message.role === 'system' || message.role === 'user') {
      snippedOldMessages.push(copyMessage(message))
      continue
    }

    if (message.role === 'assistant' && hasTextContent(message)) {
      snippedOldMessages.push({
        role: 'assistant',
        content: message.content
      })
    }
  }

  return [...snippedOldMessages, ...recentMessages.map(copyMessage)]
}

export async function compactHistory(
  messages: ChatMessage[],
  opts: CompactHistoryOptions
): Promise<ChatMessage[]> {
  if (estimateTokensForMessages(messages) < opts.thresholdTokens) {
    return messages
  }

  const systemMessage = messages[0]?.role === 'system' ? messages[0] : undefined
  const bodyMessages = systemMessage ? messages.slice(1) : messages
  const recentStart = recentRoundStart(bodyMessages, opts.keepRecentRounds)
  const oldMessages = bodyMessages.slice(0, recentStart)
  if (oldMessages.length === 0) {
    return messages
  }

  const summary = await opts.summarize(formatMessagesForSummary(oldMessages))
  const summaryMessage: ChatMessage = {
    role: 'user',
    content:
      '[Context from earlier in this conversation — the following is a summary generated when the token limit was reached. Use this as context for continuing the task.]\n\n' +
      summary
  }

  return [
    ...(systemMessage ? [systemMessage] : []),
    summaryMessage,
    ...bodyMessages.slice(recentStart)
  ]
}

function recentRoundStart(messages: ChatMessage[], keepRecentRounds: number): number {
  if (keepRecentRounds <= 0) {
    return messages.length
  }

  let roundsSeen = 0
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role !== 'user') {
      continue
    }

    roundsSeen++
    if (roundsSeen === keepRecentRounds) {
      return index
    }
  }

  return 0
}

function hasTextContent(message: ChatMessage): boolean {
  return message.content.trim().length > 0
}

function copyMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    ...(message.tool_calls
      ? {
          tool_calls: message.tool_calls.map((toolCall) => ({
            ...toolCall,
            function: { ...toolCall.function }
          }))
        }
      : {})
  }
}

function formatMessagesForSummary(messages: ChatMessage[]): string {
  return messages
    .map((message) => {
      const lines = [`[${message.role}]: ${message.content}`]
      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          lines.push(
            `[tool_call]: id=${toolCall.id} name=${toolCall.function.name} arguments=${toolCall.function.arguments}`
          )
        }
      }
      if (message.tool_call_id) {
        lines.push(`[tool_call_id]: ${message.tool_call_id}`)
      }
      return lines.join('\n')
    })
    .join('\n\n')
}
