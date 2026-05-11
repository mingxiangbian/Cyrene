import type { Tool, ToolCall, ToolContext, ToolResult } from './types.js'

export function toolDefinitions(tools: Tool<unknown>[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }))
}

export async function executeToolCall(
  call: ToolCall,
  tools: Tool<unknown>[],
  context: ToolContext
): Promise<ToolResult> {
  const tool = tools.find((candidate) => candidate.name === call.name)
  if (!tool) {
    return { ok: false, content: `Unknown tool: ${call.name}` }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(call.argumentsText)
  } catch {
    return { ok: false, content: `Invalid JSON arguments for tool ${call.name}` }
  }

  const validation = tool.schema.safeParse(parsed)
  if (!validation.success) {
    return {
      ok: false,
      content: `Invalid arguments for tool ${call.name}: ${validation.error.message}`
    }
  }

  try {
    return await tool.execute(validation.data, context)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, content: `Tool ${call.name} failed: ${message}` }
  }
}
