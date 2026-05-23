import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeActiveMemories } from '../src/memory/memory-store.js'
import type { CyreneMemory } from '../src/memory/types.js'
import { buildAgentRuntime } from '../src/web/prompt-context.js'

const originalHome = process.env.HOME
const originalTimeZone = process.env.TZ
const tempHomes: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  process.env.HOME = originalHome
  process.env.TZ = originalTimeZone
  await Promise.all(tempHomes.splice(0).map((home) => rm(home, { recursive: true, force: true })))
})

describe('buildAgentRuntime', () => {
  it('builds shared config, system prompt, and core tools for an agent runtime', async () => {
    vi.stubEnv('CYRENE_BASE_URL', 'https://api.deepseek.com')
    vi.stubEnv('CYRENE_MODEL', 'deepseek-v4-pro')
    vi.stubEnv('CYRENE_STRONG_MODEL', 'deepseek-v4-pro')
    vi.stubEnv('CYRENE_CHEAP_MODEL', 'deepseek-v4-flash')
    vi.stubEnv('CYRENE_THINKING_MODE', 'off')
    const home = await mkdtemp(join(tmpdir(), 'cyrene-web-home-'))
    tempHomes.push(home)
    process.env.HOME = home
    process.env.TZ = 'Asia/Shanghai'

    const root = join(home, 'workspace', 'project')
    const userCyreneDir = join(home, '.cyrene')

    await mkdir(join(root, '.cyrene', 'memory'), { recursive: true })
    await mkdir(join(home, 'workspace', '.cyrene'), { recursive: true })
    await mkdir(join(userCyreneDir, 'memory'), { recursive: true })
    await writeFile(join(userCyreneDir, 'soul.md'), 'Be direct.\n')
    await writeFile(join(userCyreneDir, 'Rule.md'), 'Global rule.\n')
    await writeFile(join(home, 'workspace', '.cyrene', 'Rule.md'), 'Workspace rule.\n')
    await writeFile(join(root, '.cyrene', 'Rule.md'), 'Project rule.\n')
    await writeFile(join(root, '.cyrene', 'instructions.md'), 'Use TDD.\n')
    await writeActiveMemories(root, [
      createMemory({
        id: 'project-style',
        content: 'Prefer small patches.',
        normalizedKey: 'prefer-small-patches'
      })
    ])

    const runtime = await buildAgentRuntime(root, new Date('2026-05-20T16:30:00.000Z'), {
      memoryQuery: 'small patches'
    })

    expect(runtime.config.cwd).toBe(resolve(root))
    expect(runtime.config.writableRoots).toEqual([resolve(root)])
    expect(runtime.systemPrompt).toContain('You are Cyrene, a local API-first coding agent.')
    expect(runtime.systemPrompt).toContain('Do not silently use a different file or resource as a substitute.')
    expect(runtime.systemPrompt).not.toContain('Claude Code-style')
    expect(runtime.systemPrompt).not.toContain('Anthropic')
    expect(runtime.systemPrompt).not.toContain('model router')
    expect(runtime.systemPrompt).not.toContain('When the user asks which model or provider is active')

    const expectedOrder = [
      '# currentDate\nToday\'s date is 2026-05-21.',
      [
        '## Active Model Route',
        'Provider: deepseek',
        'Chat model: deepseek-v4-pro',
        'Thinking mode: off',
        'Context window: 1048576 tokens'
      ].join('\n'),
      '## Global Persona\n\nBe direct.',
      '## Global Rule\n\nGlobal rule.',
      '## Rule:',
      'Workspace rule.',
      'Project rule.',
      '## Project Instructions\n\nUse TDD.',
      '## Relevant Memory\n- Prefer small patches.'
    ]
    let lastIndex = -1
    for (const expected of expectedOrder) {
      const index = runtime.systemPrompt.indexOf(expected)
      expect(index).toBeGreaterThan(lastIndex)
      lastIndex = index
    }

    expect(runtime.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['file_read', 'file_write', 'file_edit', 'grep', 'glob', 'bash', 'ask_user'])
    )
    expect(runtime.tools.map((tool) => tool.name)).not.toContain('generate_image')
  })

  it('uses feature flags when building runtime tools', async () => {
    vi.stubEnv('CYRENE_ENABLE_BASH', '0')
    vi.stubEnv('CYRENE_ENABLE_WEB_SEARCH', '0')
    const home = await mkdtemp(join(tmpdir(), 'cyrene-web-home-'))
    tempHomes.push(home)
    process.env.HOME = home

    const root = join(home, 'workspace', 'project')
    await mkdir(join(root, '.cyrene', 'memory'), { recursive: true })

    const runtime = await buildAgentRuntime(root)
    const names = runtime.tools.map((tool) => tool.name)

    expect(names).toEqual(['file_read', 'file_write', 'file_edit', 'grep', 'glob', 'ask_user'])
  })
})

function createMemory(overrides: Partial<CyreneMemory> = {}): CyreneMemory {
  return {
    id: 'memory-1',
    domain: 'project',
    type: 'project_fact',
    strength: 'hard',
    scope: 'project',
    status: 'active',
    content: 'Cyrene uses Personal Memory Core.',
    normalizedKey: 'cyrene-personal-memory-core',
    evidence: [{ runId: 'run-1', summary: 'Test evidence.' }],
    source: 'assistant_observed',
    scores: {
      evidenceStrength: 0.9,
      stability: 0.9,
      usefulness: 0.8,
      safety: 0.95,
      sensitivity: 0.1
    },
    createdAt: '2026-05-23T00:00:00.000Z',
    updatedAt: '2026-05-23T00:00:00.000Z',
    tags: [],
    ...overrides
  }
}
