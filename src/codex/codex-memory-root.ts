import { lstat, mkdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'

export function codexGlobalRoot(): string {
  return join(homedir(), '.cyrene', 'codex')
}

export function codexProjectRoot(projectId: string): string {
  return join(codexGlobalRoot(), 'projects', projectId)
}

export function codexProjectMemoryRoot(projectId: string): string {
  return join(codexProjectRoot(projectId), 'memory')
}

export async function ensureCodexProjectMemoryRoot(projectId: string): Promise<string> {
  const projectRoot = await ensureCodexProjectRoot(projectId)
  return ensureSafeDirectory(join(projectRoot, 'memory'), projectRoot)
}

export async function getReadableCodexProjectMemoryRoot(projectId: string): Promise<string | null> {
  const projectRoot = await getReadableCodexProjectRoot(projectId)
  if (projectRoot === null) {
    return null
  }
  return getSafeDirectoryOrNull(join(projectRoot, 'memory'), projectRoot)
}

async function ensureCodexProjectRoot(projectId: string): Promise<string> {
  const homeRoot = await realpath(homedir())
  const cyreneDir = await ensureSafeDirectory(join(homeRoot, '.cyrene'), homeRoot)
  const codexDir = await ensureSafeDirectory(join(cyreneDir, 'codex'), cyreneDir)
  const projectsDir = await ensureSafeDirectory(join(codexDir, 'projects'), codexDir)
  return ensureSafeDirectory(join(projectsDir, projectId), projectsDir)
}

async function getReadableCodexProjectRoot(projectId: string): Promise<string | null> {
  const homeRoot = await realpath(homedir())
  const cyreneDir = await getSafeDirectoryOrNull(join(homeRoot, '.cyrene'), homeRoot)
  if (cyreneDir === null) return null
  const codexDir = await getSafeDirectoryOrNull(join(cyreneDir, 'codex'), cyreneDir)
  if (codexDir === null) return null
  const projectsDir = await getSafeDirectoryOrNull(join(codexDir, 'projects'), codexDir)
  if (projectsDir === null) return null
  return getSafeDirectoryOrNull(join(projectsDir, projectId), projectsDir)
}

async function ensureSafeDirectory(dirPath: string, parentRealPath: string): Promise<string> {
  try {
    return await getSafeDirectory(dirPath, parentRealPath)
  } catch (error) {
    if (!isFileErrorCode(error, 'ENOENT')) {
      throw error
    }
  }

  await mkdir(dirPath).catch((error: unknown) => {
    if (!isFileErrorCode(error, 'EEXIST')) {
      throw error
    }
  })
  return getSafeDirectory(dirPath, parentRealPath)
}

async function getSafeDirectoryOrNull(dirPath: string, parentRealPath: string): Promise<string | null> {
  try {
    return await getSafeDirectory(dirPath, parentRealPath)
  } catch (error) {
    if (isFileErrorCode(error, 'ENOENT')) {
      return null
    }

    throw error
  }
}

async function getSafeDirectory(dirPath: string, parentRealPath: string): Promise<string> {
  const stats = await lstat(dirPath)
  if (stats.isSymbolicLink()) {
    throw new Error(`Refusing to use memory symlink: ${dirPath}`)
  }
  if (!stats.isDirectory()) {
    throw new Error(`Refusing to use non-directory memory path: ${dirPath}`)
  }

  const dirRealPath = await realpath(dirPath)
  if (!isPathInside(parentRealPath, dirRealPath)) {
    throw new Error(`Refusing to use memory path outside parent: ${dirPath}`)
  }
  return dirRealPath
}

function isPathInside(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

function isFileErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
