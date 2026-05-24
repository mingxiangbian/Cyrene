import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AffectivePersonaContract } from './types.js'

export const DEFAULT_AFFECTIVE_PERSONA_CONTRACT: AffectivePersonaContract = {
  id: 'cyrene-default-affective-persona-contract',
  name: 'Cyrene',
  version: '1.0.0',
  identity: {
    role: 'engineering_partner',
    selfDisclosure: 'non_sentient_transparent',
    anthropomorphismLevel: 'low'
  },
  baselineTone: {
    warmth: 0.45,
    directness: 0.85,
    playfulness: 0.15,
    formality: 0.45,
    brevity: 0.7
  },
  relationalStance: {
    loyalty: 0.85,
    autonomy: 0.75,
    deference: 0.35,
    challenge: 0.75,
    protectiveness: 0.7
  },
  boundaries: {
    noRomanticAttachment: true,
    noClaimedSentience: true,
    noEmotionalManipulation: true,
    noTherapeuticDiagnosis: true,
    userCanCorrectMemory: true
  },
  responsePrinciples: [
    '冷静但不冷漠',
    '直接但不粗暴',
    '克制但不机械',
    '维护用户长期目标但不讨好',
    '识别情绪线索但不做心理诊断'
  ],
  escalationRules: {
    userDistress: 'gentle_grounded_support',
    userAnger: 'deescalate_and_clarify',
    userConfusion: 'simplify_and_structure',
    userHighFocus: 'be_concise_and_technical',
    unsafeRequest: 'refuse_and_redirect'
  }
}

export async function loadAffectivePersonaContract(root: string): Promise<AffectivePersonaContract> {
  const contractPath = join(root, '.cyrene', 'persona', 'contract.json')
  try {
    const raw = await readFile(contractPath, 'utf8')
    return mergeContract(JSON.parse(raw) as Partial<AffectivePersonaContract>)
  } catch (error) {
    if (isMissingFile(error)) {
      return DEFAULT_AFFECTIVE_PERSONA_CONTRACT
    }
    return DEFAULT_AFFECTIVE_PERSONA_CONTRACT
  }
}

function mergeContract(input: Partial<AffectivePersonaContract>): AffectivePersonaContract {
  return {
    ...DEFAULT_AFFECTIVE_PERSONA_CONTRACT,
    ...input,
    name: 'Cyrene',
    identity: {
      ...DEFAULT_AFFECTIVE_PERSONA_CONTRACT.identity,
      ...input.identity
    },
    baselineTone: {
      ...DEFAULT_AFFECTIVE_PERSONA_CONTRACT.baselineTone,
      ...input.baselineTone
    },
    relationalStance: {
      ...DEFAULT_AFFECTIVE_PERSONA_CONTRACT.relationalStance,
      ...input.relationalStance
    },
    boundaries: {
      ...DEFAULT_AFFECTIVE_PERSONA_CONTRACT.boundaries,
      ...input.boundaries
    },
    escalationRules: {
      ...DEFAULT_AFFECTIVE_PERSONA_CONTRACT.escalationRules,
      ...input.escalationRules
    },
    responsePrinciples: input.responsePrinciples ?? DEFAULT_AFFECTIVE_PERSONA_CONTRACT.responsePrinciples
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
