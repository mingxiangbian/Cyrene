import { stderr, stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'
import chalk from 'chalk'
import { runAgentLoop } from './agent-loop.js'
import {
  buildContinuitySnapshot,
  formatContinuityPolicy,
  persistContinuitySnapshot,
  replaceContinuityPolicy
} from './affect/affect-runtime.js'
import type { AppConfig } from './config.js'
import { callModel as defaultCallModel, type CallModelInput, type ChatMessage, type ModelResponse } from './llm-client.js'
import { retrieveMemories } from './memory/memory-retriever.js'
import { contextInfoForRoute } from './models/provider-router.js'
import { appendSessionEvent, createSession, loadSession } from './session-store.js'
import type { Tool, ToolContext } from './tools/types.js'
import { createRunRecorder } from './tracing/run-recorder.js'
import { createTerminalObserver, renderWelcome, type AgentObserver } from './ui-observer.js'

export interface RunReplTurnInput {
  config: AppConfig
  /** Mutable session history. runReplTurn appends the user turn and agent responses in place. */
  messages: ChatMessage[]
  input: string
  tools: Tool<unknown>[]
  observer?: AgentObserver
  toolContext?: ToolContext
  session?: {
    cwd: string
    sessionId?: string
  }
  callModel?: (input: CallModelInput) => Promise<ModelResponse>
}

export type RunReplTurnResult =
  | { kind: 'exit' }
  | { kind: 'handled'; output?: string }
  | { kind: 'agent'; finalText: string; toolCallCount: number }

interface ReplReadline {
  question(prompt: string): Promise<string>
  close(): void
}

export async function runReplTurn(input: RunReplTurnInput): Promise<RunReplTurnResult> {
  const text = input.input.trim()
  if (text === '') {
    return { kind: 'handled' }
  }

  if (isExitInput(text)) {
    return { kind: 'exit' }
  }

  if (text === '/help') {
    return {
      kind: 'handled',
      output: [
        'Commands:',
        '  /help          Show this help',
        '  /model         Show model info',
        '  exit, quit, q  Exit REPL'
      ].join('\n')
    }
  }

  if (text === '/model') {
    return {
      kind: 'handled',
      output: [`Model:  ${input.config.model.model}`, `API:    ${input.config.model.baseUrl}`].join('\n')
    }
  }

  await refreshContinuityPolicy(input, text)
  const userMessage: { role: 'user'; content: string } = { role: 'user', content: text }
  input.messages.push(userMessage)
  const turnStartIndex = input.messages.length - 1

  if (input.session !== undefined) {
    if (input.session.sessionId === undefined) {
      const session = await createSession({
        cwd: input.session.cwd,
        mode: 'repl',
        model: input.config.model.model,
        firstUserMessage: userMessage
      })
      input.session.sessionId = session.id
    } else {
      await appendSessionEvent({
        cwd: input.session.cwd,
        sessionId: input.session.sessionId,
        event: { type: 'message', message: userMessage }
      })
    }
  }

  const recorder = input.session?.sessionId === undefined
    ? undefined
    : await createRunRecorder({
        cwd: input.session.cwd,
        mode: 'repl',
        sessionId: input.session.sessionId,
        userMessage,
        modelContext: contextInfoForRoute(input.config, 'chat')
      })
  let result: Awaited<ReturnType<typeof runAgentLoop>>
  try {
    result = await runAgentLoop({
      config: input.config,
      runId: recorder?.runId,
      messages: input.messages,
      tools: input.tools,
      observer: recorder?.createObserver(input.observer) ?? input.observer,
      toolContext: input.toolContext,
      callModel: recorder?.wrapCallModel(input.callModel ?? defaultCallModel) ?? input.callModel
    })

    if (input.session?.sessionId !== undefined) {
      await appendSessionEvent({
        cwd: input.session.cwd,
        sessionId: input.session.sessionId,
        event: { type: 'message', message: { role: 'assistant', content: result.finalText } }
      })
    }

    if (recorder !== undefined) {
      await recorder.recordMessages(input.messages.slice(turnStartIndex))
      await recorder.finalize({ status: 'ok', finalText: result.finalText })
    }

    return { kind: 'agent', finalText: result.finalText, toolCallCount: result.toolCallCount }
  } catch (error) {
    if (recorder !== undefined) {
      await recorder.recordMessages(input.messages.slice(turnStartIndex))
      await recorder.finalize({ status: 'error', finalText: '', error })
    }
    if (input.session?.sessionId !== undefined) {
      await appendSessionEvent({
        cwd: input.session.cwd,
        sessionId: input.session.sessionId,
        event: {
          type: 'error',
          message: error instanceof Error ? error.message : String(error)
        }
      }).catch(() => {})
    }
    throw error
  }
}

export async function runRepl(inputConfig: {
  config: AppConfig
  systemPrompt: string
  tools: Tool<unknown>[]
  callModel?: (input: CallModelInput) => Promise<ModelResponse>
  readline?: ReplReadline
  resumeSessionId?: string
}): Promise<void> {
  const resumed = inputConfig.resumeSessionId === undefined
    ? null
    : await loadSession({
        cwd: inputConfig.config.cwd,
        sessionId: inputConfig.resumeSessionId,
        recentMessages: inputConfig.config.sessionResumeRecentMessages
      })
  if (inputConfig.resumeSessionId !== undefined && resumed === null) {
    throw new Error(`Session not found: ${inputConfig.resumeSessionId}`)
  }

  const session = {
    cwd: inputConfig.config.cwd,
    sessionId: resumed?.session.id
  }
  const messages: ChatMessage[] = [
    { role: 'system', content: inputConfig.systemPrompt },
    ...(resumed?.modelMessages ?? [])
  ]
  const toolContext: ToolContext = {
    config: inputConfig.config,
    trackedFiles: new Set<string>()
  }
  const rl = inputConfig.readline ?? createInterface({ input, output })
  const observer = createTerminalObserver(stderr)
  try {
    console.log(renderWelcome({ modelName: inputConfig.config.model.model }))

    while (true) {
      const line = await rl.question('> ')
      const result = await runReplTurn({
        config: inputConfig.config,
        messages,
        input: line,
        tools: inputConfig.tools,
        observer,
        toolContext,
        session,
        callModel: inputConfig.callModel
      })

      if (result.kind === 'exit') {
        break
      }

      if (result.kind === 'handled') {
        if (result.output) {
          console.log(result.output)
        }
        continue
      }

      console.log(chalk.green(result.finalText))
      if (result.toolCallCount > 0) {
        console.error(chalk.dim(`tool calls: ${result.toolCallCount}`))
      }
    }
  } finally {
    rl.close()
  }
}

async function refreshContinuityPolicy(input: RunReplTurnInput, text: string): Promise<void> {
  const memories = await retrieveMemories({
    cwd: input.config.memoryCwd,
    userCyreneDir: input.config.userCyreneDir,
    query: text,
    task: 'conversation',
    maxItems: 8,
    maxTokens: 1200
  })
  const snapshot = await buildContinuitySnapshot({
    config: input.config,
    userMessage: text,
    task: 'conversation',
    memories: memories.map(({ memory }) => memory)
  })
  const policy = formatContinuityPolicy(snapshot)
  await persistContinuitySnapshot(input.config.memoryCwd, snapshot).catch(() => {})

  if (input.messages[0]?.role === 'system') {
    input.messages[0] = {
      ...input.messages[0],
      content: replaceContinuityPolicy(input.messages[0].content, policy)
    }
    return
  }

  input.messages.unshift({ role: 'system', content: policy })
}

function isExitInput(input: string): boolean {
  return input === 'exit' || input === 'quit' || input === 'q'
}
