import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../src/config.js'
import { fileReadTool } from '../src/tools/file-read.js'

describe('fileReadTool', () => {
  it('returns numbered lines and tracks the real file path', async () => {
    const root = join(process.cwd(), '.tmp-file-read-test')
    const file = join(root, 'note.txt')
    await mkdir(root, { recursive: true })
    await writeFile(file, 'alpha\nbeta\n', 'utf8')

    const trackedFiles = new Set<string>()
    const result = await fileReadTool.execute(
      { file_path: file },
      { config: createDefaultConfig(root), trackedFiles }
    )

    expect(result.ok).toBe(true)
    expect(result.content).toContain('1 | alpha')
    expect(result.content).toContain('2 | beta')
    expect([...trackedFiles]).toContain(file)
  })

  it('returns a helpful failure when the file does not exist', async () => {
    const root = join(process.cwd(), '.tmp-file-read-missing-test')
    await mkdir(root, { recursive: true })

    const result = await fileReadTool.execute(
      { file_path: join(root, 'missing.txt') },
      { config: createDefaultConfig(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('Unable to read file')
  })
})
