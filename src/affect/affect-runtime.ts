import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AppConfig } from '../config.js'
import type { CallModelInput, ModelResponse } from '../llm-client.js'
import { evaluatePrincipledDissent } from './dissent-policy.js'
import { loadAffectivePersonaContract } from './persona-contract.js'
import { deriveRelationshipState } from './relationship-state.js'
import { compileResponseStrategy } from './response-strategy.js'
import { deriveSyntheticAffect } from './synthetic-affect.js'
import { analyzeUserAffect } from './user-affect-analyzer.js'
import type { ContinuityMemory, ContinuitySnapshot } from './types.js'

export const CONTINUITY_POLICY_HEADING = '## Continuity Response Policy'

export interface BuildContinuitySnapshotInput {
  config: AppConfig
  userMessage: string
  task?: 'coding' | 'planning' | 'conversation' | 'memory' | 'debugging'
  memories: ContinuityMemory[]
  generatedAt?: string
  callModel?: (input: CallModelInput) => Promise<ModelResponse>
}

export async function buildContinuitySnapshot(input: BuildContinuitySnapshotInput): Promise<ContinuitySnapshot> {
  const contract = await loadAffectivePersonaContract(input.config.memoryCwd)
  const affect = await analyzeUserAffect({
    userMessage: input.userMessage,
    task: input.task,
    config: input.config,
    callModel: input.callModel
  })
  const relationship = deriveRelationshipState(input.memories)
  const syntheticAffect = deriveSyntheticAffect(affect)
  const dissent = evaluatePrincipledDissent({
    userMessage: input.userMessage,
    affect,
    memories: input.memories
  })
  const strategy = compileResponseStrategy({
    contract,
    affect,
    relationship,
    syntheticAffect,
    dissent
  })

  return {
    contract,
    affect,
    relationship,
    syntheticAffect,
    dissent,
    strategy,
    relevantMemoryCount: input.memories.length,
    generatedAt: input.generatedAt ?? new Date().toISOString()
  }
}

export function formatContinuityPolicy(snapshot: ContinuitySnapshot): string {
  return [
    CONTINUITY_POLICY_HEADING,
    `Memory count: ${snapshot.relevantMemoryCount}`,
    `Affect labels: ${snapshot.affect.labels.join(', ')}`,
    `Response need: ${snapshot.affect.responseNeed}`,
    `Relationship preference: ${snapshot.relationship.communicationPreference}`,
    `Dissent: ${snapshot.dissent.mode}${snapshot.dissent.shouldChallenge ? ` (${snapshot.dissent.reason})` : ''}`,
    'Default profile: gentle natural-language response.',
    [
      `Strategy: tone=${snapshot.strategy.tone}`,
      `style=${snapshot.strategy.languageStyle}`,
      `structure=${snapshot.strategy.structure}`,
      `verbosity=${snapshot.strategy.verbosity}`,
      `challenge=${snapshot.strategy.challenge}`,
      `agency=${snapshot.strategy.agency}`,
      `memory=${snapshot.strategy.memoryUse}`,
      `boundary=${snapshot.strategy.boundaryMode}`,
      `safety=${snapshot.strategy.safetyMode}`
    ].join('; '),
    'Instructions:',
    '- Use this policy to shape expression, not to simulate inner feelings.',
    '- Avoid claiming subjective emotion.',
    '- Avoid romantic attachment, emotional manipulation, and therapeutic diagnosis.',
    '- Challenge risky assumptions when challenge is direct or firm.',
    `- challenge=${snapshot.strategy.challenge}`,
    `- shouldAskClarifyingQuestion=${snapshot.strategy.shouldAskClarifyingQuestion}`,
    `- memoryUse=${snapshot.strategy.memoryUse}`
  ].join('\n')
}

export function replaceContinuityPolicy(systemPrompt: string, policy: string): string {
  const index = systemPrompt.indexOf(CONTINUITY_POLICY_HEADING)
  const base = index === -1 ? systemPrompt.trimEnd() : systemPrompt.slice(0, index).trimEnd()
  return [base, policy.trim()].filter(Boolean).join('\n\n')
}

export async function persistContinuitySnapshot(memoryCwd: string, snapshot: ContinuitySnapshot): Promise<void> {
  const affectDir = join(memoryCwd, '.cyrene', 'affect')
  await mkdir(affectDir, { recursive: true })
  const persisted = {
    generatedAt: snapshot.generatedAt,
    affect: snapshot.affect,
    relationship: snapshot.relationship,
    syntheticAffect: snapshot.syntheticAffect,
    dissent: snapshot.dissent,
    strategy: snapshot.strategy,
    relevantMemoryCount: snapshot.relevantMemoryCount,
    contract: {
      id: snapshot.contract.id,
      version: snapshot.contract.version
    }
  }
  await writeFile(join(affectDir, 'state.json'), `${JSON.stringify(persisted, null, 2)}\n`)
  await appendFile(join(affectDir, 'events.jsonl'), `${JSON.stringify(persisted)}\n`)
}
