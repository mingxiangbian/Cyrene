import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../src/config.js'
import { askUserTool } from '../src/tools/ask-user.js'
import { bashTool } from '../src/tools/bash.js'

describe('bash and ask_user tools', () => {
  const tempRoots: string[] = []

  async function createTempRoot(prefix: string): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), prefix))
    tempRoots.push(root)
    return root
  }

  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it('bash executes safe shell commands in configured cwd', async () => {
    const root = await createTempRoot('bash-test-')

    const result = await bashTool.execute(
      { command: 'pwd' },
      { config: createDefaultConfig(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(true)
    expect(result.content).toContain(`Working directory: ${root}`)
    expect(result.content).toContain('Exit code: 0')
    expect(result.content).toContain(root)
    expect(result.content).toContain('stderr:')
  })

  it('bash rejects deny-listed destructive commands', async () => {
    const root = await createTempRoot('bash-deny-test-')

    const result = await bashTool.execute(
      { command: 'rm -fr /' },
      { config: createDefaultConfig(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('deny-listed')
  })

  it('ask_user returns a clarification request', async () => {
    const result = await askUserTool.execute(
      { question: 'Which file should I update?' },
      { config: createDefaultConfig('/tmp/project'), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(true)
    expect(result.content).toBe('Question for user: Which file should I update?')
  })
})
