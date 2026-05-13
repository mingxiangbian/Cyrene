import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'

export async function loadInstructionsIfExists(cwd: string): Promise<string> {
  try {
    const content = await readFile(join(cwd, '.cc-local', 'instructions.md'), 'utf8')
    return `## Project Instructions\n\n${content}`
  } catch (error) {
    if (isMissingFileError(error)) {
      return ''
    }

    throw error
  }
}

export async function loadMemories(cwd: string): Promise<string> {
  const memoryDir = join(cwd, '.cc-local', 'memory')
  const cwdRealPath = await realpath(cwd)
  const intendedCcLocalDir = join(cwdRealPath, '.cc-local')
  let memoryDirRealPath: string
  let index: string

  try {
    memoryDirRealPath = await realpath(memoryDir)
    if (!isPathInside(intendedCcLocalDir, memoryDirRealPath)) {
      return ''
    }

    index = await readFile(join(memoryDirRealPath, 'MEMORY.md'), 'utf8')
  } catch (error) {
    if (isMissingFileError(error)) {
      return ''
    }

    throw error
  }

  const sections: string[] = []

  for (const line of index.split('\n')) {
    const match = line.match(/^- \[([^\]]+)\]\(([^)]+)\) — .+$/)
    if (!match) {
      continue
    }

    const [, title, filename] = match
    const memoryFilePath = resolve(memoryDir, filename)
    if (!isPathInside(memoryDir, memoryFilePath)) {
      continue
    }

    try {
      const memoryFileRealPath = await realpath(memoryFilePath)
      if (!isPathInside(memoryDirRealPath, memoryFileRealPath)) {
        continue
      }

      const content = await readFile(memoryFileRealPath, 'utf8')
      sections.push(`## Memory: ${title}\n\n${content.trim()}`)
    } catch (error) {
      if (isMissingFileError(error)) {
        continue
      }

      throw error
    }
  }

  return sections.join('\n\n')
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function isPathInside(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}
