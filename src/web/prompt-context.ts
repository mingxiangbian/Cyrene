import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AppConfig } from '../config.js'
import { createDefaultConfig } from '../config.js'
import { buildContinuitySnapshot, formatContinuityPolicy } from '../affect/affect-runtime.js'
import type { ContinuitySnapshot } from '../affect/types.js'
import type { CallModelInput, ModelResponse } from '../llm-client.js'
import { contextInfoForRoute } from '../models/provider-router.js'
import type { ThinkingMode } from '../models/types.js'
import { readModelProfileFromRootIfExists } from '../memory/model-profile.js'
import { formatMemoryContext, memoryRetrievalBudgetForTask, retrieveMemories } from '../memory/memory-retriever.js'
import { getReadableMemoryRoot } from '../memory/paths.js'
import {
  loadInstructionsIfExists,
  loadRuleStack,
  loadSoul
} from '../memory.js'
import { formatLocalDate } from '../time.js'
import { createCoreTools } from '../tools/index.js'
import type { Tool } from '../tools/types.js'

export interface AgentRuntime {
  config: AppConfig
  systemPrompt: string
  tools: Tool<unknown>[]
  continuitySnapshot: ContinuitySnapshot
}

export interface AgentRuntimeOverrides {
  thinkingMode?: ThinkingMode
  memoryCwd?: string
  memoryQuery?: string
  memoryTask?: 'coding' | 'planning' | 'conversation' | 'memory' | 'debugging'
  callModel?: (input: CallModelInput) => Promise<ModelResponse>
}

export async function buildAgentRuntime(
  cwd: string,
  currentDate = new Date(),
  overrides: AgentRuntimeOverrides = {}
): Promise<AgentRuntime> {
  const currentFile = fileURLToPath(import.meta.url)
  const systemPromptPath = resolve(dirname(currentFile), '..', 'prompts/system.md')
  const config = applyRuntimeOverrides(createDefaultConfig(resolve(cwd)), overrides)
  const baseSystemPrompt = await readFile(systemPromptPath, 'utf8')
  const currentDateText = formatLocalDate(currentDate)
  const modelRoute = formatActiveModelRoute(config)
  const persona = await loadSoul(config.userCyreneDir, config.cwd)
  const rules = await loadRuleStack(config.cwd, config.userCyreneDir)
  const projectInstructions = await loadInstructionsIfExists(config.cwd)
  const memoryTask = overrides.memoryTask ?? 'memory'
  const memoryBudget = memoryRetrievalBudgetForTask(memoryTask)
  const memories = await retrieveMemories({
    cwd: config.memoryCwd,
    userCyreneDir: config.userCyreneDir,
    query: overrides.memoryQuery ?? '',
    task: memoryTask,
    maxItems: memoryBudget.maxItems,
    maxTokens: memoryBudget.maxTokens
  })
  const modelProfile = config.memoryProfileAlwaysOnEnabled ? await readModelProfileIfExists(config.memoryCwd) : ''
  const modelProfileContext = modelProfile === '' ? '' : `## Model Profile\n${modelProfile}`
  const memoryContext = formatMemoryContext(memories)
  const continuitySnapshot = await buildContinuitySnapshot({
    config,
    userMessage: overrides.memoryQuery ?? '',
    task: memoryTask,
    memories: memories.map(({ memory }) => memory),
    generatedAt: currentDate.toISOString(),
    callModel: overrides.callModel
  })
  const continuityPolicy = formatContinuityPolicy(continuitySnapshot)
  const systemPrompt = [
    baseSystemPrompt.trimEnd(),
    `# currentDate\nToday's date is ${currentDateText}.`,
    modelRoute,
    persona,
    rules,
    projectInstructions,
    modelProfileContext,
    memoryContext,
    continuityPolicy
  ]
    .filter(Boolean)
    .join('\n\n')

  return {
    config,
    systemPrompt,
    tools: createCoreTools(config),
    continuitySnapshot
  }
}

async function readModelProfileIfExists(memoryCwd: string): Promise<string> {
  const memoryRoot = await getReadableMemoryRoot(memoryCwd)
  if (memoryRoot === null) {
    return ''
  }
  return await readModelProfileFromRootIfExists(memoryRoot) ?? ''
}

function applyRuntimeOverrides(config: AppConfig, overrides: AgentRuntimeOverrides): AppConfig {
  const memoryCwd = overrides.memoryCwd === undefined ? config.memoryCwd : resolve(overrides.memoryCwd)
  if (overrides.thinkingMode === undefined) {
    if (memoryCwd === config.memoryCwd) {
      return config
    }
    return { ...config, memoryCwd }
  }

  return {
    ...config,
    memoryCwd,
    model: {
      ...config.model,
      thinkingMode: overrides.thinkingMode
    }
  }
}

function formatActiveModelRoute(config: AppConfig): string {
  const context = contextInfoForRoute(config, 'chat')
  return [
    '## Active Model Route',
    `Provider: ${context.provider}`,
    `Chat model: ${context.model || '(not configured)'}`,
    `Thinking mode: ${context.thinkingMode}`,
    `Context window: ${context.contextWindowTokens} tokens`
  ].join('\n')
}
