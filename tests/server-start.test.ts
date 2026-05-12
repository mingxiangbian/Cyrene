import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('server/start.sh', () => {
  it('uses the mlx_lm server subcommand', async () => {
    const script = await readFile('server/start.sh', 'utf8')

    expect(script).toMatch(/-m mlx_lm server\s+\\/)
    expect(script).not.toMatch(/-m mlx_lm serve\s+\\/)
  })
})
