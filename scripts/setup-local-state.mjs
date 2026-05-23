import { mkdir, open } from 'node:fs/promises'
import { join } from 'node:path'

const rootDir = process.cwd()
const cyreneDir = join(rootDir, '.cyrene')

await mkdir(join(rootDir, 'workspace'), { recursive: true })
await mkdir(cyreneDir, { recursive: true })

const soulFile = await open(join(cyreneDir, 'Soul.md'), 'a')
await soulFile.close()

const ruleFile = await open(join(cyreneDir, 'Rule.md'), 'a')
await ruleFile.close()
