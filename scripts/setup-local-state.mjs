import { mkdir, open } from 'node:fs/promises'
import { join } from 'node:path'

const rootDir = process.cwd()

await mkdir(join(rootDir, 'workspace'), { recursive: true })
await mkdir(join(rootDir, '.cc-local', 'memory'), { recursive: true })

const dailyFile = await open(join(rootDir, '.cc-local', 'memory', 'daily.md'), 'a')
await dailyFile.close()

