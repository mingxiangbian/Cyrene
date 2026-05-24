import type {
  AffectState,
  AffectivePersonaContract,
  PrincipledDissentPolicy,
  RelationshipState,
  ResponseStrategy,
  SyntheticAffectState
} from './types.js'

export const DEFAULT_RESPONSE_STRATEGY_PROFILE = {
  tone: 'gentle',
  languageStyle: 'natural_language',
  structure: 'stepwise',
  verbosity: 'medium',
  challenge: 'soft',
  agency: 'recommend',
  memoryUse: 'light',
  boundaryMode: 'normal',
  safetyMode: 'normal'
} as const

export function compileResponseStrategy(input: {
  contract: AffectivePersonaContract
  affect: AffectState
  relationship: RelationshipState
  syntheticAffect: SyntheticAffectState
  dissent: PrincipledDissentPolicy
}): ResponseStrategy {
  const tone = toneFor(input)
  const safetyMode = input.affect.risk === 'high'
    ? 'escalate'
    : input.affect.risk === 'medium' || input.relationship.boundarySensitivity === 'careful'
      ? 'careful'
      : 'normal'
  const boundaryMode = boundaryModeFor(input.relationship, safetyMode)
  const memoryUse = memoryUseFor(input.relationship)
  const challenge = challengeFor(input.dissent)

  return {
    tone,
    languageStyle: DEFAULT_RESPONSE_STRATEGY_PROFILE.languageStyle,
    structure: structureFor(input),
    verbosity: verbosityFor(input.affect),
    challenge,
    agency: agencyFor(input.relationship, safetyMode),
    memoryUse,
    boundaryMode,
    shouldChallengeUser: input.dissent.shouldChallenge,
    shouldAskClarifyingQuestion: input.affect.labels.includes('confused') && !input.dissent.shouldChallenge,
    shouldUseHumor: input.contract.baselineTone.playfulness > 0.4 && input.affect.risk === 'low',
    shouldReferenceMemory: memoryUse === 'explicit',
    shouldAvoidAnthropomorphism: input.contract.boundaries.noClaimedSentience,
    safetyMode,
    rationale: [
      'defaultProfile=gentle/natural_language',
      `responseNeed=${input.affect.responseNeed}`,
      `relationship=${input.relationship.communicationPreference}`,
      `dissent=${input.dissent.mode}`,
      `challenge=${challenge}`,
      `memoryUse=${memoryUse}`
    ].join('; ')
  }
}

function toneFor(input: {
  affect: AffectState
  relationship: RelationshipState
  dissent: PrincipledDissentPolicy
}): ResponseStrategy['tone'] {
  if (input.affect.responseNeed === 'technical_directness') return 'technical'
  if (input.dissent.mode === 'firm') return 'firm'
  if (input.affect.responseNeed === 'lower_cognitive_load') return 'supportive'
  if (input.affect.responseNeed === 'deescalate_and_clarify') return 'gentle'
  if (input.affect.responseNeed === 'concise_execution') return 'direct'
  if (input.relationship.communicationPreference === 'direct' || input.dissent.shouldChallenge) return 'direct'
  return DEFAULT_RESPONSE_STRATEGY_PROFILE.tone
}

function verbosityFor(affect: AffectState): ResponseStrategy['verbosity'] {
  if (affect.responseNeed === 'lower_cognitive_load' || affect.responseNeed === 'concise_execution') return 'low'
  if (affect.responseNeed === 'simplify_and_structure') return 'medium'
  return DEFAULT_RESPONSE_STRATEGY_PROFILE.verbosity
}

function structureFor(input: {
  affect: AffectState
  dissent: PrincipledDissentPolicy
}): ResponseStrategy['structure'] {
  if (input.affect.responseNeed === 'deescalate_and_clarify') return 'diagnostic'
  if (input.affect.responseNeed === 'concise_execution') return input.dissent.shouldChallenge ? 'decision' : 'brief'
  if (input.affect.responseNeed === 'structured_tradeoff') return 'tradeoff'
  return DEFAULT_RESPONSE_STRATEGY_PROFILE.structure
}

function challengeFor(dissent: PrincipledDissentPolicy): ResponseStrategy['challenge'] {
  if (!dissent.shouldChallenge) return DEFAULT_RESPONSE_STRATEGY_PROFILE.challenge
  if (dissent.mode === 'firm') return 'firm'
  if (dissent.mode === 'direct') return 'direct'
  if (dissent.mode === 'gentle') return 'soft'
  return DEFAULT_RESPONSE_STRATEGY_PROFILE.challenge
}

function agencyFor(
  relationship: RelationshipState,
  safetyMode: ResponseStrategy['safetyMode']
): ResponseStrategy['agency'] {
  if (safetyMode !== 'normal') return 'ask'
  if (relationship.agencyPreference === 'ask_first') return 'ask'
  if (relationship.agencyPreference === 'execute_when_clear') return 'execute'
  return DEFAULT_RESPONSE_STRATEGY_PROFILE.agency
}

function memoryUseFor(relationship: RelationshipState): ResponseStrategy['memoryUse'] {
  if (relationship.memoryBasis === 'confirmed' && relationship.familiarity > 0.65) return 'explicit'
  return DEFAULT_RESPONSE_STRATEGY_PROFILE.memoryUse
}

function boundaryModeFor(
  relationship: RelationshipState,
  safetyMode: ResponseStrategy['safetyMode']
): ResponseStrategy['boundaryMode'] {
  if (safetyMode === 'refuse' || safetyMode === 'escalate') return 'firm'
  if (safetyMode === 'careful' || relationship.boundarySensitivity === 'careful') return 'careful'
  return DEFAULT_RESPONSE_STRATEGY_PROFILE.boundaryMode
}
