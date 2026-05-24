import { describe, expect, it, vi } from 'vitest'
import { createDefaultConfig } from '../src/config.js'
import type { CallModelInput, ModelResponse } from '../src/llm-client.js'
import { DEFAULT_AFFECTIVE_PERSONA_CONTRACT } from '../src/affect/persona-contract.js'
import { DEFAULT_RESPONSE_STRATEGY_PROFILE, compileResponseStrategy } from '../src/affect/response-strategy.js'
import { analyzeUserAffect } from '../src/affect/user-affect-analyzer.js'
import { buildContinuitySnapshot, formatContinuityPolicy } from '../src/affect/affect-runtime.js'
import { deriveRelationshipState } from '../src/affect/relationship-state.js'

describe('Phase 4 affect strategy', () => {
  it('does not emit diagnostic labels for distressed user text', async () => {
    const affect = await analyzeUserAffect({
      userMessage: '我现在有点崩，不知道下一步怎么做',
      task: 'planning'
    })

    expect(affect.labels).toContain('distressed')
    expect(affect.labels).not.toContain('depressed')
    expect(affect.responseNeed).toBe('lower_cognitive_load')
    expect(affect.rationale).not.toContain('diagnosis')
  })

  it('keeps persona boundaries while compiling response strategy', () => {
    const strategy = compileResponseStrategy({
      contract: DEFAULT_AFFECTIVE_PERSONA_CONTRACT,
      affect: {
        labels: ['focused'],
        intensity: 0.4,
        confidence: 0.8,
        responseNeed: 'technical_directness',
        risk: 'low',
        rationale: 'User is asking for implementation.'
      },
      relationship: {
        familiarity: 0.5,
        trust: 0.5,
        unresolvedFriction: false,
        boundarySensitivity: 'normal',
        communicationPreference: 'direct',
        agencyPreference: 'recommend',
        memoryBasis: 'confirmed',
        evidenceMemoryIds: ['pref-direct']
      },
      syntheticAffect: {
        curiosity: 0.5,
        skepticism: 0.4,
        concern: 0.2,
        patience: 0.7
      },
      dissent: {
        shouldChallenge: true,
        reason: 'Risky technical assumption.',
        mode: 'direct'
      }
    })

    expect(strategy.challenge).toBe('direct')
    expect(strategy.boundaryMode).toBe('normal')
    expect(strategy.shouldAvoidAnthropomorphism).toBe(true)
    expect(strategy.tone).toBe('technical')
    expect(strategy.languageStyle).toBe('natural_language')
    expect(strategy.safetyMode).toBe('normal')
  })

  it('uses the default response strategy profile when no turn state overrides it', () => {
    const strategy = compileResponseStrategy({
      contract: DEFAULT_AFFECTIVE_PERSONA_CONTRACT,
      affect: {
        labels: ['neutral'],
        intensity: 0.2,
        confidence: 0.8,
        responseNeed: 'normal',
        risk: 'low',
        rationale: 'No specific affect signal.'
      },
      relationship: {
        familiarity: 0.2,
        trust: 0.2,
        unresolvedFriction: false,
        boundarySensitivity: 'normal',
        communicationPreference: 'structured',
        agencyPreference: 'recommend',
        memoryBasis: 'none',
        evidenceMemoryIds: []
      },
      syntheticAffect: {
        curiosity: 0.45,
        skepticism: 0.35,
        concern: 0.2,
        patience: 0.65
      },
      dissent: {
        shouldChallenge: false,
        reason: 'No principled dissent trigger detected.',
        mode: 'none'
      }
    })

    expect(strategy).toEqual(expect.objectContaining(DEFAULT_RESPONSE_STRATEGY_PROFILE))
    expect(strategy.shouldAvoidAnthropomorphism).toBe(true)
    expect(strategy.shouldAskClarifyingQuestion).toBe(false)
    expect(strategy.shouldUseHumor).toBe(false)
    expect(strategy.rationale).toContain('defaultProfile=gentle/natural_language')
  })

  it('derives relationship state without duplicating memory text', () => {
    const relationship = deriveRelationshipState([
      {
        id: 'mem-direct',
        domain: 'relationship',
        content: '用户明确说过：以后架构问题可以直接反驳我。'
      },
      {
        id: 'mem-boundary',
        domain: 'relationship',
        content: '用户要求保持关系边界，不要过度拟人。'
      }
    ])

    expect(relationship.communicationPreference).toBe('direct')
    expect(relationship.boundarySensitivity).toBe('careful')
    expect(relationship.memoryBasis).toBe('confirmed')
    expect(relationship.evidenceMemoryIds).toEqual(['mem-direct', 'mem-boundary'])
    expect(JSON.stringify(relationship)).not.toContain('以后架构问题可以直接反驳我')
  })

  it('uses affect_analysis when a model caller is provided and keeps output bounded', async () => {
    const callModel = vi.fn(async (input: CallModelInput): Promise<ModelResponse> => {
      expect(input.useCase).toBe('affect_analysis')
      return {
        content: JSON.stringify({
          labels: ['confused', 'depressed'],
          intensity: 2,
          confidence: 0.9,
          responseNeed: 'simplify_and_structure',
          risk: 'medium',
          rationale: 'The user asks for clarification.'
        }),
        toolCalls: []
      }
    })

    const affect = await analyzeUserAffect({
      userMessage: '我没看懂，帮我拆一下',
      task: 'planning',
      config: createDefaultConfig('/tmp/project'),
      callModel
    })

    expect(callModel).toHaveBeenCalledTimes(1)
    expect(affect.labels).toEqual(['confused'])
    expect(affect.intensity).toBe(1)
    expect(affect.responseNeed).toBe('simplify_and_structure')
  })

  it('builds a continuity snapshot and formats a non-anthropomorphic policy', async () => {
    const snapshot = await buildContinuitySnapshot({
      config: createDefaultConfig('/tmp/project'),
      userMessage: '这个方案风险挺高，直接说哪里不成立',
      task: 'planning',
      memories: [
        {
          id: 'pref-direct',
          domain: 'relationship',
          content: 'User prefers direct technical judgment.'
        }
      ],
      generatedAt: '2026-05-24T00:00:00.000Z'
    })

    const policy = formatContinuityPolicy(snapshot)

    expect(snapshot.relevantMemoryCount).toBe(1)
    expect(snapshot.relationship.communicationPreference).toBe('direct')
    expect(snapshot.relationship.evidenceMemoryIds).toEqual(['pref-direct'])
    expect(snapshot.dissent.shouldChallenge).toBe(true)
    expect(snapshot.strategy.languageStyle).toBe('natural_language')
    expect(snapshot.strategy.memoryUse).toBe('light')
    expect(snapshot.strategy.challenge).toBe('direct')
    expect(policy).toContain('## Continuity Response Policy')
    expect(policy).toContain('Avoid claiming subjective emotion.')
    expect(policy).toContain('Default profile: gentle natural-language response.')
    expect(policy).toContain('Strategy: tone=technical; style=natural_language; structure=stepwise; verbosity=medium; challenge=direct; agency=recommend; memory=light; boundary=normal; safety=normal')
    expect(policy).toContain('Challenge risky assumptions when challenge is direct or firm.')
    expect(policy).not.toContain('Cyrene feels')
  })
})
