import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultConfig } from '../src/config.js'
import type { CallModelInput, ModelResponse } from '../src/llm-client.js'
import { createRunRecorder } from '../src/tracing/run-recorder.js'
import { traceRunDir } from '../src/tracing/trace-store.js'
import type { AgentObserver } from '../src/ui-observer.js'

const tempDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cyrene-run-recorder-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('run-recorder', () => {
  it('records model calls and forwards observer events', async () => {
    const cwd = await createTempDir()
    const events: string[] = []
    const baseObserver: AgentObserver = {
      onThinkingStart: () => events.push('thinking:start'),
      onThinkingStop: () => events.push('thinking:stop'),
      onToolCallStart: (_name, _summary, toolCallId) => events.push(`tool:start:${toolCallId}`),
      onToolCallResult: (_name, ok, _durationMs, _summary, toolCallId) => events.push(`tool:result:${toolCallId}:${ok}`),
      onResponse: (text) => events.push(`response:${text}`)
    }
    const recorder = await createRunRecorder({
      cwd,
      runId: 'run-1',
      mode: 'cli',
      startedAt: new Date('2026-05-23T00:00:00.000Z'),
      userMessage: { role: 'user', content: 'hello' },
      modelContext: {
        provider: 'openai-compatible',
        model: 'test-model',
        thinkingMode: 'auto',
        contextWindowTokens: 256000
      }
    })

    const callModel = vi.fn(async (_input: CallModelInput): Promise<ModelResponse> => ({
      content: 'ok',
      toolCalls: [],
      usage: { promptTokens: 1, completionTokens: 2 },
      route: {
        provider: 'openai-compatible',
        model: 'test-model',
        useCase: 'chat',
        thinkingMode: 'auto',
        temperature: 0.7,
        capabilities: {
          contextWindowTokens: 256000,
          supportsToolCalls: true,
          supportsThinking: false,
          supportsReasoningReplay: false
        }
      }
    }))

    await recorder.wrapCallModel(callModel)({
      config: createDefaultConfig(cwd),
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      useCase: 'chat'
    })
    const observer = recorder.createObserver(baseObserver)
    observer.onThinkingStart()
    observer.onThinkingStop(12)
    observer.onToolCallStart('glob', 'package.json', 'call-1')
    observer.onToolCallResult('glob', true, 3, 'package.json', 'call-1')
    observer.onResponse('ok')
    await recorder.recordMessages([{ role: 'assistant', content: 'ok' }])
    await recorder.finalize({ status: 'ok', finalText: 'ok' })

    expect(events).toEqual([
      'thinking:start',
      'thinking:stop',
      'tool:start:call-1',
      'tool:result:call-1:true',
      'response:ok'
    ])
    const dir = traceRunDir(cwd, 'run-1')
    await expect(readFile(join(dir, 'model-calls.jsonl'), 'utf8')).resolves.toContain('"promptTokens":1')
    await expect(readFile(join(dir, 'tool-calls.jsonl'), 'utf8')).resolves.toContain('"toolCallId":"call-1"')
    await expect(readFile(join(dir, 'messages.jsonl'), 'utf8')).resolves.toContain('"content":"ok"')
    await expect(readFile(join(dir, 'metrics.json'), 'utf8')).resolves.toContain('"modelCallCount": 1')
  })

  it('records failed model calls and error metrics', async () => {
    const cwd = await createTempDir()
    const recorder = await createRunRecorder({
      cwd,
      runId: 'run-error',
      mode: 'cli',
      startedAt: new Date('2026-05-23T00:00:00.000Z'),
      userMessage: { role: 'user', content: 'hello' }
    })
    const callModel = vi.fn(async (_input: CallModelInput): Promise<ModelResponse> => {
      throw new Error('model failed')
    })

    await expect(recorder.wrapCallModel(callModel)({
      config: createDefaultConfig(cwd),
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      useCase: 'chat'
    })).rejects.toThrow('model failed')
    await recorder.finalize({ status: 'error', finalText: '', error: new Error('model failed') })

    const dir = traceRunDir(cwd, 'run-error')
    await expect(readFile(join(dir, 'model-calls.jsonl'), 'utf8')).resolves.toContain('"ok":false')
    await expect(readFile(join(dir, 'metrics.json'), 'utf8')).resolves.toContain('"status": "error"')
  })
})
