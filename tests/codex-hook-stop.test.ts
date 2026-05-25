import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { codexProjectMemoryRoot } from '../src/codex/codex-memory-root.js'
import { handleCodexStopHookPayload } from '../src/codex/codex-hook-stop.js'
import { identifyCodexProject } from '../src/codex/project-id.js'

const originalHome = process.env.HOME
const tempDirs: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  process.env.HOME = originalHome
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function createTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

describe('Codex Stop hook runtime', () => {
  it('no-ops when transcript is missing', async () => {
    const home = await createTempDir('cyrene-codex-stop-home-')
    vi.stubEnv('HOME', home)
    const cwd = await createTempDir('cyrene-codex-stop-project-')

    const result = await handleCodexStopHookPayload({ cwd, session_id: 's1', turn_id: 't1' })

    expect(result.action).toBe('noop')
    const identity = await identifyCodexProject(cwd)
    await expect(readFile(join(codexProjectMemoryRoot(identity.projectId), 'pending.jsonl'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('writes pending memory for explicit durable user instruction', async () => {
    const home = await createTempDir('cyrene-codex-stop-home-')
    vi.stubEnv('HOME', home)
    const cwd = await createTempDir('cyrene-codex-stop-project-')
    const transcript = join(cwd, 'transcript.jsonl')
    await writeFile(
      transcript,
      [
        JSON.stringify({ role: 'user', content: '以后默认 Cyrene 的 spec 和 plan 用中文写。' }),
        JSON.stringify({ role: 'assistant', content: '已确认。' })
      ].join('\n') + '\n'
    )

    const result = await handleCodexStopHookPayload({
      cwd,
      session_id: 's1',
      turn_id: 't1',
      transcript_path: transcript,
      last_assistant_message: '已确认。'
    })

    expect(result.action).toBe('pending')
    const identity = await identifyCodexProject(cwd)
    const pending = await readFile(join(codexProjectMemoryRoot(identity.projectId), 'pending.jsonl'), 'utf8')
    expect(pending).toContain('以后默认 Cyrene 的 spec 和 plan 用中文写。')
    await expect(readFile(join(codexProjectMemoryRoot(identity.projectId), 'index.jsonl'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('no-ops when transcript has no explicit durable signal', async () => {
    const home = await createTempDir('cyrene-codex-stop-home-')
    vi.stubEnv('HOME', home)
    const cwd = await createTempDir('cyrene-codex-stop-project-')
    const transcript = join(cwd, 'transcript.jsonl')
    await writeFile(transcript, JSON.stringify({ role: 'user', content: '今天这个测试通过了吗？' }) + '\n')

    const result = await handleCodexStopHookPayload({ cwd, transcript_path: transcript })

    expect(result.action).toBe('noop')
  })
})
