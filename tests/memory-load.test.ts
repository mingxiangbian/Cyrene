import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadMemories } from '../src/memory.js'

const tempDirs: string[] = []

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cc-local-memory-'))
  tempDirs.push(dir)
  return dir
}

async function createMemoryDir(root: string): Promise<string> {
  const dir = join(root, '.cc-local', 'memory')
  await mkdir(dir, { recursive: true })
  return dir
}

describe('loadMemories', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('returns an empty string when .cc-local/memory/ does not exist', async () => {
    const root = await createTempDir()

    await expect(loadMemories(root)).resolves.toBe('')
  })

  it('returns an empty string when .cc-local/memory is a symlink outside the project', async () => {
    const root = await createTempDir()
    const outsideMemoryDir = await createTempDir()
    await mkdir(join(root, '.cc-local'), { recursive: true })
    await writeFile(join(outsideMemoryDir, 'MEMORY.md'), '- [Outside](outside.md) — should not load\n')
    await writeFile(join(outsideMemoryDir, 'outside.md'), 'Do not load outside memory.\n')
    await symlink(outsideMemoryDir, join(root, '.cc-local', 'memory'))

    await expect(loadMemories(root)).resolves.toBe('')
  })

  it('returns an empty string when MEMORY.md is empty', async () => {
    const root = await createTempDir()
    const memoryDir = await createMemoryDir(root)
    await writeFile(join(memoryDir, 'MEMORY.md'), '')

    await expect(loadMemories(root)).resolves.toBe('')
  })

  it('loads and formats memory files referenced in MEMORY.md', async () => {
    const root = await createTempDir()
    const memoryDir = await createMemoryDir(root)
    await writeFile(
      join(memoryDir, 'MEMORY.md'),
      '- [Architecture](architecture.md) — agent loop notes\n- [Style](style.md) — coding style\n'
    )
    await writeFile(join(memoryDir, 'architecture.md'), 'Use small context windows.\n\n')
    await writeFile(join(memoryDir, 'style.md'), 'Keep edits surgical.\n')

    await expect(loadMemories(root)).resolves.toBe(
      '## Memory: Architecture\n\nUse small context windows.\n\n## Memory: Style\n\nKeep edits surgical.'
    )
  })

  it('skips malformed lines in MEMORY.md', async () => {
    const root = await createTempDir()
    const memoryDir = await createMemoryDir(root)
    await writeFile(
      join(memoryDir, 'MEMORY.md'),
      'not a memory entry\n- [Valid](valid.md) — useful summary\n- Missing bracket](invalid.md) — bad\n'
    )
    await writeFile(join(memoryDir, 'valid.md'), 'Load this one.\n')

    await expect(loadMemories(root)).resolves.toBe('## Memory: Valid\n\nLoad this one.')
  })

  it('skips memory files that do not exist', async () => {
    const root = await createTempDir()
    const memoryDir = await createMemoryDir(root)
    await writeFile(
      join(memoryDir, 'MEMORY.md'),
      '- [Missing](missing.md) — not present\n- [Existing](existing.md) — present\n'
    )
    await writeFile(join(memoryDir, 'existing.md'), 'Present memory.\n')

    await expect(loadMemories(root)).resolves.toBe('## Memory: Existing\n\nPresent memory.')
  })

  it('skips memory index entries whose paths escape .cc-local/memory', async () => {
    const root = await createTempDir()
    const memoryDir = await createMemoryDir(root)
    await writeFile(
      join(memoryDir, 'MEMORY.md'),
      '- [Outside](../../outside.md) — should not load\n- [Inside](inside.md) — should load\n'
    )
    await writeFile(join(root, 'outside.md'), 'Do not inject this content.\n')
    await writeFile(join(memoryDir, 'inside.md'), 'Load this memory.\n')

    await expect(loadMemories(root)).resolves.toBe('## Memory: Inside\n\nLoad this memory.')
  })

  it('skips symlinked memory files that resolve outside .cc-local/memory', async () => {
    const root = await createTempDir()
    const memoryDir = await createMemoryDir(root)
    await writeFile(
      join(memoryDir, 'MEMORY.md'),
      '- [Outside](link.md) — should not load\n- [Inside](inside.md) — should load\n'
    )
    await writeFile(join(root, 'outside.md'), 'Do not inject this symlinked content.\n')
    await symlink(join(root, 'outside.md'), join(memoryDir, 'link.md'))
    await writeFile(join(memoryDir, 'inside.md'), 'Load this memory.\n')

    await expect(loadMemories(root)).resolves.toBe('## Memory: Inside\n\nLoad this memory.')
  })
})
