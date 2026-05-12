import { z } from 'zod'
import type { Tool } from './types.js'

const schema = z.object({
  question: z.string().min(1)
})

export const askUserTool: Tool<z.infer<typeof schema>> = {
  name: 'ask_user',
  description: 'Stop tool execution and ask the user a clarification question.',
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The clarification question to ask the user.' }
    },
    required: ['question'],
    additionalProperties: false
  },
  schema,
  isReadonly: true,
  isDestructive: false,
  isConcurrencySafe: false,
  needsUserInteraction: true,
  async execute(args) {
    return { ok: true, content: `Question for user: ${args.question}` }
  }
}
