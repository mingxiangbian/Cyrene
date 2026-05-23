import type { CallModelInput, ChatMessage, ModelResponse } from '../llm-client.js'
import type { ModelContextInfo } from '../models/types.js'
import type { AgentObserver } from '../ui-observer.js'
import { createTraceRun, type TraceRunStore } from './trace-store.js'
import type { TraceInput, TraceMode, TraceStatus, TraceToolCallLine } from './types.js'

export interface CreateRunRecorderInput {
  cwd: string
  runId?: string
  mode: TraceMode
  startedAt?: Date
  workspaceId?: string
  workspacePath?: string
  sessionId?: string
  userMessage: { role: 'user'; content: string }
  modelContext?: ModelContextInfo
}

export interface FinalizeRunRecorderInput {
  status: TraceStatus
  finalText: string
  error?: unknown
}

interface ToolStart {
  at: string
  name: string
  inputSummary: string
}

export class RunRecorder {
  readonly runId: string
  readonly dir?: string
  readonly warnings: string[] = []
  private readonly startedAt: Date
  private readonly store?: TraceRunStore
  private modelCallCount = 0
  private toolCallCount = 0
  private errorCount = 0
  private readonly toolStarts = new Map<string, ToolStart>()

  constructor(input: { startedAt: Date; store?: TraceRunStore; runId: string }) {
    this.startedAt = input.startedAt
    this.store = input.store
    this.runId = input.runId
    this.dir = input.store?.dir
  }

  wrapCallModel(callModel: (input: CallModelInput) => Promise<ModelResponse>): (input: CallModelInput) => Promise<ModelResponse> {
    return async (input) => {
      const callId = `model-${this.modelCallCount + 1}`
      const startedAt = new Date()
      const startedMs = Date.now()
      try {
        const response = await callModel(input)
        this.modelCallCount += 1
        await this.safeWrite(() => this.store?.appendModelCall({
          callId,
          at: startedAt.toISOString(),
          useCase: input.useCase ?? 'chat',
          provider: response.route?.provider ?? response.providerMetadata?.provider,
          model: response.route?.model ?? response.providerMetadata?.model,
          thinkingMode: response.route?.thinkingMode ?? response.providerMetadata?.thinking?.mode,
          messageCount: input.messages.length,
          toolCount: input.tools.length,
          durationMs: Date.now() - startedMs,
          ok: true,
          usage: response.usage ?? response.providerMetadata?.usage
        }))
        return response
      } catch (error) {
        this.modelCallCount += 1
        this.errorCount += 1
        await this.safeWrite(() => this.store?.appendModelCall({
          callId,
          at: startedAt.toISOString(),
          useCase: input.useCase ?? 'chat',
          messageCount: input.messages.length,
          toolCount: input.tools.length,
          durationMs: Date.now() - startedMs,
          ok: false,
          error: errorMessage(error)
        }))
        throw error
      }
    }
  }

  createObserver(baseObserver?: AgentObserver): AgentObserver {
    return {
      onThinkingStart: (modelContext) => baseObserver?.onThinkingStart(modelContext),
      onThinkingStop: (durationMs) => baseObserver?.onThinkingStop(durationMs),
      onToolCallStart: (name, summary, toolCallId) => {
        if (toolCallId !== undefined) {
          this.toolStarts.set(toolCallId, {
            at: new Date().toISOString(),
            name,
            inputSummary: summary
          })
        }
        baseObserver?.onToolCallStart(name, summary, toolCallId)
      },
      onToolCallResult: (name, ok, durationMs, summary, toolCallId) => {
        this.toolCallCount += 1
        if (!ok) {
          this.errorCount += 1
        }
        const fallbackId = toolCallId ?? `tool-${this.toolCallCount}`
        const started = this.toolStarts.get(fallbackId)
        const line: TraceToolCallLine = {
          toolCallId: fallbackId,
          at: started?.at ?? new Date().toISOString(),
          name: started?.name ?? name,
          inputSummary: started?.inputSummary ?? name,
          outputSummary: summary,
          durationMs,
          ok,
          ...(ok ? {} : { error: summary })
        }
        void this.safeWrite(() => this.store?.appendToolCall(line))
        baseObserver?.onToolCallResult(name, ok, durationMs, summary, toolCallId)
      },
      onResponse: (text) => baseObserver?.onResponse(text)
    }
  }

  async recordMessages(messages: ChatMessage[]): Promise<void> {
    for (const message of messages) {
      if (message.role === 'system') {
        continue
      }
      await this.safeWrite(() => this.store?.appendMessage({
        at: new Date().toISOString(),
        message
      }))
    }
  }

  async finalize(input: FinalizeRunRecorderInput): Promise<void> {
    if (input.status === 'error') {
      this.errorCount += 1
    }
    const finishedAt = new Date()
    await this.safeWrite(() => this.store?.finalize({
      runId: this.runId,
      status: input.status,
      startedAt: this.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - this.startedAt.getTime(),
      modelCallCount: this.modelCallCount,
      toolCallCount: this.toolCallCount,
      errorCount: this.errorCount,
      finalTextLength: input.finalText.length
    }, input.status === 'ok' ? input.finalText : errorMessage(input.error)))
  }

  private async safeWrite(action: () => Promise<void> | undefined): Promise<void> {
    try {
      await action()
    } catch (error) {
      this.warnings.push(errorMessage(error))
    }
  }
}

export async function createRunRecorder(input: CreateRunRecorderInput): Promise<RunRecorder> {
  const startedAt = input.startedAt ?? new Date()
  const traceInput: TraceInput = {
    runId: input.runId ?? 'pending',
    mode: input.mode,
    cwd: input.cwd,
    ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
    ...(input.workspacePath === undefined ? {} : { workspacePath: input.workspacePath }),
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    startedAt: startedAt.toISOString(),
    userMessage: input.userMessage,
    ...(input.modelContext === undefined ? {} : { modelContext: input.modelContext })
  }

  try {
    const store = await createTraceRun({
      cwd: input.cwd,
      runId: input.runId,
      input: traceInput
    })
    return new RunRecorder({ startedAt, store, runId: store.runId })
  } catch (error) {
    const recorder = new RunRecorder({ startedAt, runId: input.runId ?? 'trace-disabled' })
    recorder.warnings.push(errorMessage(error))
    return recorder
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
