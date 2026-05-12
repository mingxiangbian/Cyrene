import { spawn } from 'node:child_process'
import { z } from 'zod'
import type { Tool } from './types.js'

const OUTPUT_LIMIT_BYTES = 65_536

const schema = z.object({
  command: z.string().min(1),
  description: z.string().min(1).optional()
})

export const bashTool: Tool<z.infer<typeof schema>> = {
  name: 'bash',
  description: 'Execute a shell command in the configured working directory.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute.' },
      description: { type: 'string', description: 'Optional human-readable purpose for the command.' }
    },
    required: ['command'],
    additionalProperties: false
  },
  schema,
  isReadonly: false,
  isDestructive: true,
  isConcurrencySafe: false,
  needsUserInteraction: false,
  async execute(args, context) {
    if (context.config.bashDenyPatterns.some((pattern) => pattern.test(args.command))) {
      return { ok: false, content: `Command rejected by bash deny-listed pattern: ${args.command}` }
    }

    return await new Promise((resolve) => {
      const child = spawn(args.command, {
        cwd: context.config.cwd,
        detached: true,
        shell: true
      })

      let stdout = ''
      let stderr = ''
      let stdoutBytes = 0
      let stderrBytes = 0
      let stdoutTruncated = false
      let stderrTruncated = false
      let timedOut = false
      let killTimer: NodeJS.Timeout | undefined
      let settled = false

      const timeout = setTimeout(() => {
        timedOut = true
        killChild(child.pid, 'SIGTERM', () => child.kill('SIGTERM'))
        killTimer = setTimeout(() => {
          killChild(child.pid, 'SIGKILL', () => child.kill('SIGKILL'))
        }, 5_000)
      }, context.config.bashTimeoutMs)

      child.stdout.on('data', (chunk) => {
        const captured = captureOutput(chunk, stdoutBytes, stdoutTruncated, 'stdout')
        stdout += captured.text
        stdoutBytes = captured.bytes
        stdoutTruncated = captured.truncated
      })
      child.stderr.on('data', (chunk) => {
        const captured = captureOutput(chunk, stderrBytes, stderrTruncated, 'stderr')
        stderr += captured.text
        stderrBytes = captured.bytes
        stderrTruncated = captured.truncated
      })
      child.on('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (killTimer) clearTimeout(killTimer)
        resolve({
          ok: false,
          content: formatBashResult(context.config.cwd, null, stdout, `${stderr}${error.message}`, timedOut)
        })
      })
      child.on('close', (code) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (killTimer) clearTimeout(killTimer)
        resolve({
          ok: code === 0 && !timedOut,
          content: formatBashResult(context.config.cwd, code, stdout, stderr, timedOut)
        })
      })
    })
  }
}

function formatBashResult(
  cwd: string,
  exitCode: number | null,
  stdout: string,
  stderr: string,
  timedOut: boolean
): string {
  return [
    `Working directory: ${cwd}`,
    `Exit code: ${exitCode === null ? 'null' : exitCode}`,
    `Timed out: ${timedOut ? 'yes' : 'no'}`,
    'stdout:',
    stdout.trimEnd(),
    'stderr:',
    stderr.trimEnd()
  ].join('\n')
}

function captureOutput(
  chunk: Buffer,
  currentBytes: number,
  alreadyTruncated: boolean,
  streamName: 'stdout' | 'stderr'
): { text: string; bytes: number; truncated: boolean } {
  if (alreadyTruncated) {
    return { text: '', bytes: currentBytes + chunk.length, truncated: true }
  }

  const remaining = OUTPUT_LIMIT_BYTES - currentBytes
  if (chunk.length <= remaining) {
    return { text: chunk.toString(), bytes: currentBytes + chunk.length, truncated: false }
  }

  return {
    text: `${chunk.subarray(0, Math.max(remaining, 0)).toString()}\n[${streamName} truncated after ${OUTPUT_LIMIT_BYTES} bytes]`,
    bytes: currentBytes + chunk.length,
    truncated: true
  }
}

function killChild(pid: number | undefined, signal: NodeJS.Signals, fallback: () => void): void {
  if (pid === undefined) {
    fallback()
    return
  }

  try {
    process.kill(-pid, signal)
  } catch {
    fallback()
  }
}
