import { readFile } from 'node:fs/promises'
import { proposeCodexMemoryCandidate } from './memory-propose.js'
import { parseTranscriptMessages } from './transcript.js'

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

export interface CodexStopHookCommandOutput {
  continue: true
  suppressOutput: true
}

const DURABLE_SIGNAL = /记住|请记住|以后默认|之后默认|以后你要|以后请|from now on|please remember|remember that|default to/i

export async function handleCodexStopHookCommand(): Promise<string> {
  const payload = await readJsonFromStdin()
  const result = await handleCodexStopHookPayload(payload)
  return formatCodexStopHookCommandOutput(result)
}

export function formatCodexStopHookCommandOutput(_result: CodexStopHookResult): string {
  const output: CodexStopHookCommandOutput = {
    continue: true,
    suppressOutput: true
  }
  return `${JSON.stringify(output)}\n`
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

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}
