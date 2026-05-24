import type { AppConfig } from '../config.js'
import type { CallModelInput, ModelResponse } from '../llm-client.js'
import type { CyreneMemory, MemoryDomain, MemoryType } from '../memory/types.js'

export type PersonaRole = 'personal_assistant' | 'engineering_partner' | 'memory_companion'
export type SelfDisclosureMode = 'non_sentient_transparent'
export type AnthropomorphismLevel = 'low' | 'medium' | 'high'

export interface AffectivePersonaContract {
  id: string
  name: 'Cyrene'
  version: string
  identity: {
    role: PersonaRole
    selfDisclosure: SelfDisclosureMode
    anthropomorphismLevel: AnthropomorphismLevel
  }
  baselineTone: {
    warmth: number
    directness: number
    playfulness: number
    formality: number
    brevity: number
  }
  relationalStance: {
    loyalty: number
    autonomy: number
    deference: number
    challenge: number
    protectiveness: number
  }
  boundaries: {
    noRomanticAttachment: boolean
    noClaimedSentience: boolean
    noEmotionalManipulation: boolean
    noTherapeuticDiagnosis: boolean
    userCanCorrectMemory: boolean
  }
  responsePrinciples: string[]
  escalationRules: {
    userDistress: 'gentle_grounded_support'
    userAnger: 'deescalate_and_clarify'
    userConfusion: 'simplify_and_structure'
    userHighFocus: 'be_concise_and_technical'
    unsafeRequest: 'refuse_and_redirect'
  }
}

export type AffectLabel =
  | 'neutral'
  | 'focused'
  | 'high_focus'
  | 'confused'
  | 'distressed'
  | 'frustrated'
  | 'angry'
  | 'uncertain'
  | 'urgent'

export type ResponseNeed =
  | 'normal'
  | 'lower_cognitive_load'
  | 'simplify_and_structure'
  | 'deescalate_and_clarify'
  | 'technical_directness'
  | 'concise_execution'

export type AffectRisk = 'low' | 'medium' | 'high'

export interface AffectState {
  labels: AffectLabel[]
  intensity: number
  confidence: number
  responseNeed: ResponseNeed
  risk: AffectRisk
  rationale: string
}

export type BoundarySensitivity = 'normal' | 'careful'
export type CommunicationPreference = 'direct' | 'gentle' | 'concise' | 'structured'

export interface RelationshipState {
  familiarity: number
  trust: number
  unresolvedFriction: boolean
  boundarySensitivity: BoundarySensitivity
  communicationPreference: CommunicationPreference
}

export interface SyntheticAffectState {
  curiosity: number
  skepticism: number
  concern: number
  patience: number
}

export interface PrincipledDissentPolicy {
  shouldChallenge: boolean
  reason: string
  mode: 'none' | 'gentle' | 'direct' | 'firm'
}

export interface ResponseStrategy {
  tone: 'direct' | 'gentle' | 'technical' | 'supportive' | 'firm'
  verbosity: 'low' | 'medium' | 'high'
  shouldChallengeUser: boolean
  shouldAskClarifyingQuestion: boolean
  shouldUseHumor: boolean
  shouldReferenceMemory: boolean
  shouldAvoidAnthropomorphism: boolean
  safetyMode: 'normal' | 'careful' | 'refuse' | 'escalate'
  rationale: string
}

export type ContinuityMemory = Pick<CyreneMemory, 'id' | 'content'> & {
  domain?: MemoryDomain
  type?: MemoryType
  tags?: string[]
}

export interface ContinuitySnapshot {
  contract: AffectivePersonaContract
  affect: AffectState
  relationship: RelationshipState
  syntheticAffect: SyntheticAffectState
  dissent: PrincipledDissentPolicy
  strategy: ResponseStrategy
  relevantMemoryCount: number
  generatedAt: string
}

export interface AnalyzeUserAffectInput {
  userMessage: string
  task?: 'coding' | 'planning' | 'conversation' | 'memory' | 'debugging'
  config?: AppConfig
  callModel?: (input: CallModelInput) => Promise<ModelResponse>
}
