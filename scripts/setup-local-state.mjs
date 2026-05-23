import { mkdir, open } from 'node:fs/promises'
import { join } from 'node:path'

const rootDir = process.cwd()

await mkdir(join(rootDir, 'workspace'), { recursive: true })
await mkdir(join(rootDir, '.cyrene', 'memory'), { recursive: true })

const dailyFile = await open(join(rootDir, '.cyrene', 'memory', 'daily.md'), 'a')
await dailyFile.close()
