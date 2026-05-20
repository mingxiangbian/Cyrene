import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { getWritableMemoryDir } from './memory.js'

export async function appendDaily(cwd: string, chunks: string[]): Promise<void> {
  const nonEmptyChunks = chunks.map((chunk) => chunk.trim()).filter(Boolean)
  if (nonEmptyChunks.length === 0) {
    return
  }

  const memoryDir = await getWritableMemoryDir(cwd)
  const dailyPath = join(memoryDir, 'daily.md')
  const file = await open(
    dailyPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW
  )

  try {
    await file.writeFile(`${nonEmptyChunks.join('\n')}\n`)
  } finally {
    await file.close()
  }
}
