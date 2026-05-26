import { readFile } from 'node:fs/promises'
import { proposeCodexMemoryCandidate } from './memory-propose.js'

export interface CodexStopHookPayload {
  cwd?: unknown
  session_id?: unknown
  turn_id?: unknown
  transcript_path?: unknown
  transcriptPath?: unknown
  last_assistant_message?: unknown
  [key: string]: unknown
}

export type CodexStopHookResult =
  | { action: 'noop'; reason: string }
  | { action: 'pending'; candidateId: string; reason: string }
  | { action: 'reject'; reason: string }

interface TranscriptMessage {
  role: string
  content: string
}

const DURABLE_SIGNAL = /记住|请记住|以后默认|之后默认|以后你要|以后请|from now on|please remember|remember that|default to/i

export async function handleCodexStopHookCommand(): Promise<string> {
  const payload = await readJsonFromStdin()
  const result = await handleCodexStopHookPayload(payload)
  return `${JSON.stringify(result, null, 2)}\n`
}

export async function readJsonFromStdin(): Promise<CodexStopHookPayload> {
  process.stdin.setEncoding('utf8')
  let text = ''
  for await (const chunk of process.stdin) {
    text += chunk
  }
  const trimmed = text.trim()
  return trimmed === '' ? {} : JSON.parse(trimmed) as CodexStopHookPayload
}

export async function handleCodexStopHookPayload(payload: CodexStopHookPayload): Promise<CodexStopHookResult> {
  const instruction = await extractRecentExplicitMemoryInstruction(payload)
  if (instruction === undefined) {
    return { action: 'noop', reason: 'No explicit durable user instruction found.' }
  }

  const runId = [asString(payload.session_id), asString(payload.turn_id)].filter(Boolean).join(':') || undefined
  const content = instruction.slice(0, 500)
  const result = await proposeCodexMemoryCandidate({
    cwd: asString(payload.cwd) ?? process.cwd(),
    candidate: {
      domain: 'procedural',
      type: 'procedural_rule',
      strength: 'hard',
      scope: 'project',
      source: 'user_explicit',
      content,
      evidence: [
        {
          runId,
          quote: content,
          summary: 'Codex Stop hook captured explicit durable user instruction.'
        }
      ],
      tags: ['codex-hook', 'explicit-memory']
    }
  })

  if (result.result.action === 'reject') {
    return { action: 'reject', reason: result.result.reason }
  }
  return { action: 'pending', candidateId: result.result.candidateId, reason: result.result.reason }
}

export async function extractRecentExplicitMemoryInstruction(payload: CodexStopHookPayload): Promise<string | undefined> {
  const transcriptPath = asString(payload.transcript_path) ?? asString(payload.transcriptPath)
  if (transcriptPath === undefined) {
    return undefined
  }

  let transcriptText: string
  try {
    transcriptText = await readFile(transcriptPath, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined
    }
    throw error
  }

  const messages = parseTranscriptMessages(transcriptText)
  const userMessages = messages.filter((message) => message.role === 'user')
  return userMessages.reverse().find((message) => DURABLE_SIGNAL.test(message.content))?.content
}

export function parseTranscriptMessages(text: string): TranscriptMessage[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return parseTranscriptLine(JSON.parse(line) as unknown)
      } catch {
        return []
      }
    })
}

function parseTranscriptLine(value: unknown): TranscriptMessage[] {
  const record = isRecord(value) ? value : undefined
  const source = isRecord(record?.message) ? record.message : record
  const role = asString(source?.role)
  const content = contentToString(source?.content)
  if (role === undefined || content === undefined) {
    return []
  }
  return [{ role, content }]
}

function contentToString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }
  if (!Array.isArray(value)) {
    return undefined
  }
  const parts = value.flatMap((entry) => {
    if (typeof entry === 'string') {
      return [entry]
    }
    if (isRecord(entry) && typeof entry.text === 'string') {
      return [entry.text]
    }
    return []
  })
  return parts.length > 0 ? parts.join('\n') : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
