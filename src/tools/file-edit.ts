import { readFile, realpath, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'
import type { Tool } from './types.js'

const schema = z.object({
  file_path: z.string().min(1),
  old_string: z.string().min(1),
  new_string: z.string()
})

function resolveFromCwd(cwd: string, filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(cwd, filePath)
}

function isUnderRoot(path: string, root: string): boolean {
  const relativePath = relative(root, path)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

async function isUnderWritableRoot(path: string, roots: string[]): Promise<boolean> {
  for (const root of roots) {
    if (isUnderRoot(path, await realpath(root))) {
      return true
    }
  }
  return false
}

export const fileEditTool: Tool<z.infer<typeof schema>> = {
  name: 'file_edit',
  description: 'Replace one exact string in a UTF-8 file. The file must have been read earlier in the session.',
  parameters: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: 'Absolute path or path relative to the current working directory.' },
      old_string: { type: 'string', description: 'Exact text currently present in the file.' },
      new_string: { type: 'string', description: 'Replacement text.' }
    },
    required: ['file_path', 'old_string', 'new_string'],
    additionalProperties: false
  },
  schema,
  isReadonly: false,
  isDestructive: true,
  isConcurrencySafe: false,
  needsUserInteraction: false,
  async execute(args, context) {
    const resolved = resolveFromCwd(context.config.cwd, args.file_path)
    const canonical = await realpath(resolved)

    if (!context.trackedFiles.has(canonical)) {
      return { ok: false, content: `Refusing to edit ${canonical}: must read the file before editing.` }
    }

    if (!(await isUnderWritableRoot(canonical, context.config.writableRoots))) {
      return { ok: false, content: `Refusing to edit ${canonical}: outside writable roots.` }
    }

    const content = await readFile(canonical, 'utf8')
    const occurrences = content.split(args.old_string).length - 1
    if (occurrences !== 1) {
      return { ok: false, content: `Expected exactly one match for old_string, found ${occurrences}.` }
    }

    await writeFile(canonical, content.replace(args.old_string, args.new_string), 'utf8')
    return { ok: true, content: `Edited ${canonical}` }
  }
}
