import { appendFile, mkdir, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, resolve, sep } from 'node:path'
import type {
  TraceInput,
  TraceMessageLine,
  TraceMetrics,
  TraceModelCallLine,
  TraceToolCallLine
} from './types.js'

const DEFAULT_TRACE_RUN_LIMIT = 100

export interface CreateTraceRunInput {
  cwd: string
  runId?: string
  input: TraceInput
}

export interface TraceRunStore {
  runId: string
  dir: string
  appendMessage(line: TraceMessageLine): Promise<void>
  appendModelCall(line: TraceModelCallLine): Promise<void>
  appendToolCall(line: TraceToolCallLine): Promise<void>
  finalize(metrics: TraceMetrics, finalText: string): Promise<void>
}

export async function createTraceRun(input: CreateTraceRunInput): Promise<TraceRunStore> {
  const runId = input.runId ?? randomUUID()
  assertSafeTraceRunId(runId)
  const dir = traceRunDir(input.cwd, runId)
  await ensureTraceDir(input.cwd, dir)
  await writeJson(join(dir, 'input.json'), { ...input.input, runId })
  await pruneTraceRuns(input.cwd, runId).catch(() => undefined)

  return {
    runId,
    dir,
    appendMessage: (line) => appendJsonLine(join(dir, 'messages.jsonl'), line),
    appendModelCall: (line) => appendJsonLine(join(dir, 'model-calls.jsonl'), line),
    appendToolCall: (line) => appendJsonLine(join(dir, 'tool-calls.jsonl'), line),
    finalize: async (metrics, finalText) => {
      await writeFile(join(dir, 'final.md'), finalText, 'utf8')
      await writeJson(join(dir, 'metrics.json'), metrics)
    }
  }
}

export function traceRunDir(cwd: string, runId: string): string {
  assertSafeTraceRunId(runId)
  const root = tracesDir(cwd)
  const dir = resolve(root, runId)
  if (dir !== root && !dir.startsWith(`${root}${sep}`)) {
    throw new Error(`Unsafe trace run id: ${runId}`)
  }
  return dir
}

export function tracesDir(cwd: string): string {
  return resolve(cwd, '.cyrene', 'runs')
}

export function assertSafeTraceRunId(runId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(runId)) {
    throw new Error(`Unsafe trace run id: ${runId}`)
  }
}

async function ensureTraceDir(cwd: string, dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  const [cwdRealPath, dirRealPath] = await Promise.all([
    realpath(cwd),
    realpath(dir)
  ])
  if (dirRealPath !== cwdRealPath && !dirRealPath.startsWith(`${cwdRealPath}${sep}`)) {
    throw new Error('Trace directory must stay inside the project.')
  }
}

async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await appendFile(path, `${JSON.stringify(value)}\n`, 'utf8')
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function pruneTraceRuns(cwd: string, currentRunId: string): Promise<void> {
  const root = tracesDir(cwd)
  const entries = (await readdir(root, { withFileTypes: true })).filter((entry) => {
    if (!entry.isDirectory() || entry.name === currentRunId) {
      return false
    }

    try {
      assertSafeTraceRunId(entry.name)
      return true
    } catch {
      return false
    }
  })

  const overflowCount = entries.length + 1 - DEFAULT_TRACE_RUN_LIMIT
  if (overflowCount <= 0) {
    return
  }

  const candidates = await Promise.all(entries.map(async (entry) => ({
    name: entry.name,
    mtimeMs: (await stat(join(root, entry.name))).mtimeMs
  })))
  candidates.sort((left, right) => left.mtimeMs - right.mtimeMs || left.name.localeCompare(right.name))

  await Promise.all(
    candidates.slice(0, overflowCount).map((candidate) =>
      rm(join(root, candidate.name), { recursive: true, force: true })
    )
  )
}
