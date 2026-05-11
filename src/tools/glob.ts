import { realpath } from 'node:fs/promises'
import { isAbsolute, relative } from 'node:path'
import { glob } from 'tinyglobby'
import { z } from 'zod'
import type { Tool } from './types.js'

const schema = z.object({
  pattern: z.string().min(1)
})

function isConfinedPattern(pattern: string): boolean {
  return !isAbsolute(pattern) && !pattern.split(/[\\/]+/).includes('..')
}

function isInside(parent: string, child: string): boolean {
  const relativePath = relative(parent, child)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

export const globTool: Tool<z.infer<typeof schema>> = {
  name: 'glob',
  description: 'Find files matching a glob pattern relative to the current working directory.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: "Glob pattern such as 'src/**/*.ts'." }
    },
    required: ['pattern'],
    additionalProperties: false
  },
  schema,
  isReadonly: true,
  isDestructive: false,
  isConcurrencySafe: false,
  needsUserInteraction: false,
  async execute(args, context) {
    if (!isConfinedPattern(args.pattern)) {
      return { ok: false, content: 'Glob pattern cannot point outside current working directory.' }
    }

    const matches = await glob(args.pattern, {
      cwd: context.config.cwd,
      absolute: true,
      onlyFiles: true,
      dot: true
    })

    const canonicalCwd = await realpath(context.config.cwd)
    const confinedMatches: string[] = []
    for (const path of matches) {
      const canonicalPath = await realpath(path).catch(() => undefined)
      if (canonicalPath && isInside(canonicalCwd, canonicalPath)) {
        confinedMatches.push(path)
      }
    }

    const output = confinedMatches.map((path) => relative(context.config.cwd, path)).sort().join('\n')
    return { ok: true, content: output || 'No files matched.' }
  }
}
