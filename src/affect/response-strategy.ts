import type {
  AffectState,
  AffectivePersonaContract,
  PrincipledDissentPolicy,
  RelationshipState,
  ResponseStrategy,
  SyntheticAffectState
} from './types.js'

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

  return {
    tone,
    verbosity: verbosityFor(input.affect),
    shouldChallengeUser: input.dissent.shouldChallenge,
    shouldAskClarifyingQuestion: input.affect.labels.includes('confused') && !input.dissent.shouldChallenge,
    shouldUseHumor: input.contract.baselineTone.playfulness > 0.4 && input.affect.risk === 'low',
    shouldReferenceMemory: input.relationship.familiarity > 0.45,
    shouldAvoidAnthropomorphism: input.contract.boundaries.noClaimedSentience,
    safetyMode,
    rationale: [
      `responseNeed=${input.affect.responseNeed}`,
      `relationship=${input.relationship.communicationPreference}`,
      `dissent=${input.dissent.mode}`
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
  if (input.relationship.communicationPreference === 'direct' || input.dissent.shouldChallenge) return 'direct'
  return 'gentle'
}

function verbosityFor(affect: AffectState): ResponseStrategy['verbosity'] {
  if (affect.responseNeed === 'lower_cognitive_load' || affect.responseNeed === 'concise_execution') return 'low'
  if (affect.responseNeed === 'simplify_and_structure') return 'medium'
  return 'medium'
}
