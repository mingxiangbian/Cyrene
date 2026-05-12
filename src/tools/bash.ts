import { spawn } from 'node:child_process'
import { z } from 'zod'
import type { Tool } from './types.js'

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
        shell: true
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false
      let killTimer: NodeJS.Timeout | undefined

      const timeout = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
        killTimer = setTimeout(() => {
          child.kill('SIGKILL')
        }, 5_000)
      }, context.config.bashTimeoutMs)

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })
      child.on('error', (error) => {
        clearTimeout(timeout)
        if (killTimer) clearTimeout(killTimer)
        resolve({
          ok: false,
          content: formatBashResult(context.config.cwd, null, stdout, `${stderr}${error.message}`, timedOut)
        })
      })
      child.on('close', (code) => {
        clearTimeout(timeout)
        if (killTimer) clearTimeout(killTimer)
        resolve({
          ok: code === 0,
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
