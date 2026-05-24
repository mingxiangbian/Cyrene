import type { CommunicationPreference, ContinuityMemory, RelationshipState } from './types.js'

export function deriveRelationshipState(memories: ContinuityMemory[]): RelationshipState {
  const text = memories.map((memory) => memory.content.toLowerCase()).join('\n')
  const communicationPreference = communicationPreferenceFromMemory(text)
  const evidenceMemoryIds = memories.map((memory) => memory.id)

  return {
    familiarity: clamp(0.35 + Math.min(memories.length, 6) * 0.08),
    trust: clamp(0.45 + Math.min(memories.length, 5) * 0.06),
    unresolvedFriction: containsAny(text, ['冲突', '不满', 'friction', 'complaint']),
    boundarySensitivity: containsAny(text, ['边界', 'boundary', 'romantic', '主观情绪']) ? 'careful' : 'normal',
    communicationPreference,
    agencyPreference: agencyPreferenceFromMemory(text),
    memoryBasis: evidenceMemoryIds.length > 0 ? 'confirmed' : 'none',
    evidenceMemoryIds
  }
}

function communicationPreferenceFromMemory(text: string): CommunicationPreference {
  if (containsAny(text, ['direct', '直接', '判断', '结论先'])) return 'direct'
  if (containsAny(text, ['concise', '简洁', '短'])) return 'concise'
  if (containsAny(text, ['structured', '结构', '步骤'])) return 'structured'
  if (containsAny(text, ['gentle', '温和'])) return 'gentle'
  return 'structured'
}

function agencyPreferenceFromMemory(text: string): RelationshipState['agencyPreference'] {
  if (containsAny(text, ['先问', '先确认', 'ask first', '确认后'])) return 'ask_first'
  if (containsAny(text, ['直接执行', 'execute when clear', '条件明确'])) return 'execute_when_clear'
  return 'recommend'
}

function containsAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle))
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}
