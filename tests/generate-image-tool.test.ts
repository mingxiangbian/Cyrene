import { mkdir, mkdtemp, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultConfig, type AppConfig } from '../src/config.js'
import { generateImageTool } from '../src/tools/generate-image.js'

const tempRoots: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function tempRoot(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'generate-image-tool-')))
  tempRoots.push(root)
  return root
}

function config(root: string, outputDir = 'generated-images'): AppConfig {
  return {
    ...createDefaultConfig(root),
    t2i: {
      baseUrl: 'http://127.0.0.1:7861',
      outputDir
    }
  }
}

function mockJsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

describe('generateImageTool', () => {
  it('describes local SD1.5 text-to-image generation', () => {
    expect(generateImageTool.description).toContain('local text-to-image')
    expect(generateImageTool.description).toContain('local SD1.5 worker')
  })

  it('validates schema defaults, dimension constraints, and count limit', () => {
    const defaults = generateImageTool.schema.safeParse({ prompt: 'portrait' })
    expect(defaults.success).toBe(true)
    if (defaults.success) {
      expect(defaults.data.width).toBe(512)
      expect(defaults.data.height).toBe(768)
      expect(defaults.data.steps).toBe(30)
      expect(defaults.data.cfg_scale).toBe(7)
      expect(defaults.data.count).toBe(1)
    }

    expect(generateImageTool.schema.safeParse({ prompt: 'portrait', width: 500 }).success).toBe(false)
    expect(generateImageTool.schema.safeParse({ prompt: 'portrait', height: 1025 }).success).toBe(false)
    expect(generateImageTool.schema.safeParse({ prompt: 'portrait', count: 5 }).success).toBe(false)
  })

  it('sends defaults to the T2I worker and formats returned paths', async () => {
    const root = await tempRoot()
    const imagePath = join(root, 'generated-images', 'image-1.png')
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      mockJsonResponse({
        model: 'majicmixRealistic_v7',
        images: [{ path: imagePath, seed: 42, width: 512, height: 768 }]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateImageTool.execute(
      { prompt: 'portrait photo' },
      { config: config(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(true)
    expect((await stat(join(root, 'generated-images'))).isDirectory()).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:7861/generate', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json' }
    }))
    const sent = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(sent).toEqual({
      prompt: 'portrait photo',
      negative_prompt: '',
      width: 512,
      height: 768,
      steps: 30,
      cfg_scale: 7,
      count: 1,
      output_dir: join(root, 'generated-images')
    })
    expect(result.content).toContain('Generated 1 image with majicmixRealistic_v7.')
    expect(result.content).toContain(`absolute path: ${imagePath}`)
    expect(result.content).toContain('relative path: generated-images/image-1.png')
    expect(result.content).toContain('seed: 42')
    expect(result.content).toContain('size: 512x768')
  })

  it('passes explicit dimensions, count, seed, and negative prompt', async () => {
    const root = await tempRoot()
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      mockJsonResponse({
        model: 'majicmixRealistic_v7',
        images: [
          { path: join(root, 'generated-images', 'a.png'), seed: 7, width: 768, height: 512 },
          { path: join(root, 'generated-images', 'b.png'), seed: 8, width: 768, height: 512 }
        ]
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateImageTool.execute(
      {
        prompt: 'landscape',
        negative_prompt: 'low quality',
        width: 768,
        height: 512,
        steps: 24,
        cfg_scale: 6,
        seed: 7,
        count: 2
      },
      { config: config(root), trackedFiles: new Set<string>() }
    )

    const sent = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(result.ok).toBe(true)
    expect(sent.width).toBe(768)
    expect(sent.height).toBe(512)
    expect(sent.seed).toBe(7)
    expect(sent.count).toBe(2)
    expect(sent.negative_prompt).toBe('low quality')
    expect(result.content).toContain('Generated 2 images')
  })

  it('rejects dimensions that are not multiples of 64', async () => {
    const root = await tempRoot()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateImageTool.execute(
      { prompt: 'portrait', width: 500 },
      { config: config(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('width and height must be multiples of 64')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects oversized images before calling the worker', async () => {
    const root = await tempRoot()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateImageTool.execute(
      { prompt: 'large', width: 2048, height: 1024 },
      { config: config(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('width * height must not exceed 1048576')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects symlinked output parents before creating outside directories', async () => {
    const root = await tempRoot()
    const outside = await tempRoot()
    await symlink(outside, join(root, 'linked-output'))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateImageTool.execute(
      { prompt: 'portrait' },
      { config: config(root, 'linked-output/nested'), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('outside current working directory')
    expect(await pathExists(join(outside, 'nested'))).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns a clear error when the worker is unavailable', async () => {
    const root = await tempRoot()
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('connect ECONNREFUSED')
    }))

    const result = await generateImageTool.execute(
      { prompt: 'portrait' },
      { config: config(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('T2I worker request failed')
    expect(result.content).toContain('connect ECONNREFUSED')
  })

  it('rejects worker paths outside the output directory', async () => {
    const root = await tempRoot()
    vi.stubGlobal('fetch', vi.fn(async () =>
      mockJsonResponse({
        model: 'majicmixRealistic_v7',
        images: [{ path: join(root, 'outside.png'), seed: 1, width: 512, height: 768 }]
      })
    ))

    const result = await generateImageTool.execute(
      { prompt: 'portrait' },
      { config: config(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('outside generated image output directory')
  })

  it('rejects worker paths that resolve outside the output directory through symlinks', async () => {
    const root = await tempRoot()
    const outside = await tempRoot()
    const outputDir = join(root, 'generated-images')
    await mkdir(outputDir)
    await symlink(outside, join(outputDir, 'link'))
    await writeFile(join(outside, 'image.png'), 'fake image', 'utf8')
    vi.stubGlobal('fetch', vi.fn(async () =>
      mockJsonResponse({
        model: 'majicmixRealistic_v7',
        images: [{ path: join(outputDir, 'link', 'image.png'), seed: 1, width: 512, height: 768 }]
      })
    ))

    const result = await generateImageTool.execute(
      { prompt: 'portrait' },
      { config: config(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('outside generated image output directory')
  })

  it('rejects worker responses with no images', async () => {
    const root = await tempRoot()
    vi.stubGlobal('fetch', vi.fn(async () =>
      mockJsonResponse({
        model: 'majicmixRealistic_v7',
        images: []
      })
    ))

    const result = await generateImageTool.execute(
      { prompt: 'portrait' },
      { config: config(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('unexpected response')
  })

  it('rejects worker image count mismatches', async () => {
    const root = await tempRoot()
    vi.stubGlobal('fetch', vi.fn(async () =>
      mockJsonResponse({
        model: 'majicmixRealistic_v7',
        images: [{ path: join(root, 'generated-images', 'only.png'), seed: 1, width: 512, height: 768 }]
      })
    ))

    const result = await generateImageTool.execute(
      { prompt: 'portrait', count: 2 },
      { config: config(root), trackedFiles: new Set<string>() }
    )

    expect(result.ok).toBe(false)
    expect(result.content).toContain('expected 2 images but received 1')
  })
})
