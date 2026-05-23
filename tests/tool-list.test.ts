import { describe, expect, it } from 'vitest'
import { createDefaultConfig } from '../src/config.js'
import { createCoreTools } from '../src/tools/index.js'

describe('createCoreTools', () => {
  it('registers the default core tool set without generate_image', () => {
    const config = createDefaultConfig('/tmp/project')
    const names = createCoreTools(config).map((tool) => tool.name)

    expect(names).toEqual([
      'file_read',
      'file_write',
      'file_edit',
      'grep',
      'glob',
      'ask_user',
      'bash',
      'web_search'
    ])
    expect(names).not.toContain('generate_image')
    expect(names).not.toContain('task')
  })

  it('omits bash when the bash feature flag is disabled', () => {
    const config = createDefaultConfig('/tmp/project')
    config.features.bashEnabled = false

    const names = createCoreTools(config).map((tool) => tool.name)

    expect(names).not.toContain('bash')
    expect(names).toContain('web_search')
  })

  it('omits web_search when the web search feature flag is disabled', () => {
    const config = createDefaultConfig('/tmp/project')
    config.features.webSearchEnabled = false

    const names = createCoreTools(config).map((tool) => tool.name)

    expect(names).toContain('bash')
    expect(names).not.toContain('web_search')
  })

  it('omits both gated tools when both feature flags are disabled', () => {
    const config = createDefaultConfig('/tmp/project')
    config.features.bashEnabled = false
    config.features.webSearchEnabled = false

    const names = createCoreTools(config).map((tool) => tool.name)

    expect(names).toEqual([
      'file_read',
      'file_write',
      'file_edit',
      'grep',
      'glob',
      'ask_user'
    ])
  })
})
