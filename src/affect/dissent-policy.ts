import type { AffectState, ContinuityMemory, PrincipledDissentPolicy } from './types.js'

export function evaluatePrincipledDissent(input: {
  userMessage: string
  affect: AffectState
  memories: ContinuityMemory[]
}): PrincipledDissentPolicy {
  const text = [input.userMessage, ...input.memories.map((memory) => memory.content)].join('\n').toLowerCase()
  if (containsAny(text, ['不成立', '风险', '反驳', '错', 'danger', 'risky', 'unsafe', 'contradiction'])) {
    return {
      shouldChallenge: true,
      reason: 'Current request or relevant memory indicates technical risk or a questionable assumption.',
      mode: input.affect.labels.includes('distressed') ? 'gentle' : 'direct'
    }
  }

  return {
    shouldChallenge: false,
    reason: 'No principled dissent trigger detected.',
    mode: 'none'
  }
}

function containsAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle))
}
