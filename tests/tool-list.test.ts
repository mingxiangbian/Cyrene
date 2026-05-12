import { describe, expect, it } from 'vitest'
import { createCoreTools } from '../src/tools/index.js'

describe('createCoreTools', () => {
  it('registers the v1 tool set with no sub-agent tool', () => {
    const names = createCoreTools().map((tool) => tool.name)

    expect(names).toEqual([
      'bash',
      'file_read',
      'file_write',
      'file_edit',
      'grep',
      'glob',
      'ask_user'
    ])
    expect(names).not.toContain('task')
    expect(names.length).toBeLessThanOrEqual(8)
  })
})
