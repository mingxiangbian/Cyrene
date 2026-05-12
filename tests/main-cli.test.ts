import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

describe('main CLI', () => {
  it('prints model errors without a Node stack trace', async () => {
    try {
      await execFileAsync(
        process.execPath,
        ['node_modules/tsx/dist/cli.mjs', 'src/main.ts', 'hello'],
        {
          env: {
            ...process.env,
            CC_LOCAL_BASE_URL: 'http://127.0.0.1:1/v1'
          }
        }
      )
      throw new Error('CLI unexpectedly succeeded')
    } catch (error) {
      const stderr = String((error as { stderr?: string }).stderr ?? '')
      expect((error as { code?: number }).code).toBe(1)
      expect(stderr.trim()).toBe('LLM request failed: fetch failed')
    }
  })
})
