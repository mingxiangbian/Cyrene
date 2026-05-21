import { mkdir, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'
import type { Tool } from './types.js'

const MAX_PIXELS = 1024 * 1024
const MIN_DIMENSION = 64
const MAX_DIMENSION = 1024

interface GenerateImageArgs {
  prompt: string
  negative_prompt?: string
  width?: number
  height?: number
  steps?: number
  cfg_scale?: number
  seed?: number
  count?: number
}

const dimensionSchema = z.number()
  .int()
  .min(MIN_DIMENSION)
  .max(MAX_DIMENSION)
  .refine((value) => value % 64 === 0, 'width and height must be multiples of 64')

const schema: z.ZodType<GenerateImageArgs> = z.object({
  prompt: z.string().min(1),
  negative_prompt: z.string().optional(),
  width: dimensionSchema.default(512),
  height: dimensionSchema.default(768),
  steps: z.number().int().positive().default(30),
  cfg_scale: z.number().positive().default(7),
  seed: z.number().int().optional(),
  count: z.number().int().min(1).max(4).default(1)
})

const workerResponseSchema = z.object({
  model: z.string(),
  images: z.array(z.object({
    path: z.string().min(1),
    seed: z.number().int(),
    width: z.number().int(),
    height: z.number().int()
  })).nonempty()
})

type GenerateImageRequest = {
  prompt: string
  negative_prompt: string
  width: number
  height: number
  steps: number
  cfg_scale: number
  count: number
  output_dir: string
  seed?: number
}

function isUnderRoot(path: string, root: string): boolean {
  const relativePath = relative(root, path)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

function toRelativeDisplayPath(cwd: string, path: string): string {
  return relative(cwd, path).replaceAll('\\', '/')
}

async function nearestExistingCanonicalParent(path: string): Promise<string> {
  let current = path

  while (true) {
    try {
      return await realpath(current)
    } catch {
      const next = dirname(current)
      if (next === current) {
        throw new Error(`No existing parent for ${path}`)
      }
      current = next
    }
  }
}

function validateDimensions(width: number, height: number): string | null {
  if (width % 64 !== 0 || height % 64 !== 0) {
    return 'width and height must be multiples of 64'
  }
  if (width * height > MAX_PIXELS) {
    return `width * height must not exceed ${MAX_PIXELS}`
  }
  return null
}

function resolveOutputDir(cwd: string, outputDir: string): { ok: true; path: string } | { ok: false; content: string } {
  if (outputDir.trim() === '') {
    return { ok: false, content: 'Refusing to use empty T2I output directory.' }
  }
  if (isAbsolute(outputDir)) {
    return { ok: false, content: 'Refusing to use absolute T2I output directory.' }
  }
  if (outputDir.split(/[\\/]+/).includes('..')) {
    return { ok: false, content: 'Refusing to use T2I output directory with parent traversal.' }
  }

  const resolvedCwd = resolve(cwd)
  const resolvedOutputDir = resolve(resolvedCwd, outputDir)
  if (!isUnderRoot(resolvedOutputDir, resolvedCwd)) {
    return { ok: false, content: 'Refusing to use T2I output directory outside current working directory.' }
  }

  return { ok: true, path: resolvedOutputDir }
}

function normalizeArgs(args: GenerateImageArgs, outputDir: string): GenerateImageRequest {
  const request: GenerateImageRequest = {
    prompt: args.prompt,
    negative_prompt: args.negative_prompt ?? '',
    width: args.width ?? 512,
    height: args.height ?? 768,
    steps: args.steps ?? 30,
    cfg_scale: args.cfg_scale ?? 7,
    count: args.count ?? 1,
    output_dir: outputDir
  }

  if (args.seed !== undefined) {
    request.seed = args.seed
  }

  return request
}

function endpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/generate`
}

async function readWorkerJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`invalid JSON: ${message}`)
  }
}

async function resolveWorkerImagePath(
  imagePath: string,
  canonicalOutputDir: string
): Promise<{ ok: true; path: string } | { ok: false; content: string }> {
  const resolved = isAbsolute(imagePath) ? resolve(imagePath) : resolve(canonicalOutputDir, imagePath)
  if (!isUnderRoot(resolved, canonicalOutputDir)) {
    return { ok: false, content: `T2I worker returned path outside generated image output directory: ${imagePath}` }
  }

  try {
    const canonical = await realpath(resolved)
    if (!isUnderRoot(canonical, canonicalOutputDir)) {
      return { ok: false, content: `T2I worker returned path outside generated image output directory: ${imagePath}` }
    }
    return { ok: true, path: canonical }
  } catch {
    const canonicalParent = await nearestExistingCanonicalParent(dirname(resolved))
    if (!isUnderRoot(canonicalParent, canonicalOutputDir)) {
      return { ok: false, content: `T2I worker returned path outside generated image output directory: ${imagePath}` }
    }
    return { ok: true, path: resolved }
  }
}

export const generateImageTool: Tool<GenerateImageArgs> = {
  name: 'generate_image',
  description: 'Generate PNG images from a prompt using local text-to-image generation with the configured local SD1.5 worker.',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Text prompt describing the image to generate.' },
      negative_prompt: { type: 'string', description: 'Optional prompt describing what to avoid.' },
      width: { type: 'number', description: 'Image width in pixels, 64 to 1024 and a multiple of 64. Defaults to 512.' },
      height: { type: 'number', description: 'Image height in pixels, 64 to 1024 and a multiple of 64. Defaults to 768.' },
      steps: { type: 'number', description: 'Diffusion step count. Defaults to 30.' },
      cfg_scale: { type: 'number', description: 'Classifier-free guidance scale. Defaults to 7.' },
      seed: { type: 'number', description: 'Optional generation seed.' },
      count: { type: 'number', description: 'Number of images to generate, 1 to 4. Defaults to 1.' }
    },
    required: ['prompt'],
    additionalProperties: false
  },
  schema,
  isReadonly: false,
  isDestructive: false,
  isConcurrencySafe: false,
  needsUserInteraction: false,
  async execute(args, context) {
    const outputDir = resolveOutputDir(context.config.cwd, context.config.t2i.outputDir)
    if (!outputDir.ok) {
      return outputDir
    }

    const request = normalizeArgs(args, outputDir.path)
    const dimensionError = validateDimensions(request.width, request.height)
    if (dimensionError) {
      return { ok: false, content: dimensionError }
    }

    const canonicalCwd = await realpath(context.config.cwd)
    const canonicalExistingParent = await nearestExistingCanonicalParent(outputDir.path)
    if (!isUnderRoot(canonicalExistingParent, canonicalCwd)) {
      return { ok: false, content: 'Refusing to use T2I output directory outside current working directory.' }
    }

    await mkdir(outputDir.path, { recursive: true })
    const canonicalOutputDir = await realpath(outputDir.path)
    if (!isUnderRoot(canonicalOutputDir, canonicalCwd)) {
      return { ok: false, content: 'Refusing to use T2I output directory outside current working directory.' }
    }
    request.output_dir = canonicalOutputDir

    let response: Response
    try {
      response = await fetch(endpoint(context.config.t2i.baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request)
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, content: `T2I worker request failed: ${message}` }
    }

    if (!response.ok) {
      const body = await response.text()
      return {
        ok: false,
        content: `T2I worker returned HTTP ${response.status} ${response.statusText}: ${body}`
      }
    }

    let workerJson: unknown
    try {
      workerJson = await readWorkerJson(response)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, content: `T2I worker returned ${message}` }
    }

    const parsed = workerResponseSchema.safeParse(workerJson)
    if (!parsed.success) {
      return { ok: false, content: `T2I worker returned unexpected response: ${parsed.error.message}` }
    }

    if (parsed.data.images.length !== request.count) {
      return {
        ok: false,
        content: `T2I worker returned image count mismatch: expected ${request.count} images but received ${parsed.data.images.length}.`
      }
    }

    const images = []
    for (const image of parsed.data.images) {
      const imagePath = await resolveWorkerImagePath(image.path, canonicalOutputDir)
      if (!imagePath.ok) {
        return imagePath
      }
      images.push({ ...image, path: imagePath.path })
    }

    const imageLines = images.flatMap((image, index) => {
      return [
        `${index + 1}. absolute path: ${image.path}`,
        `   relative path: ${toRelativeDisplayPath(canonicalCwd, image.path)}`,
        `   seed: ${image.seed}`,
        `   size: ${image.width}x${image.height}`
      ]
    })

    const imageWord = images.length === 1 ? 'image' : 'images'
    return {
      ok: true,
      content: [
        `Generated ${images.length} ${imageWord} with ${parsed.data.model}.`,
        ...imageLines
      ].join('\n'),
      metadata: {
        model: parsed.data.model,
        images
      }
    }
  }
}
