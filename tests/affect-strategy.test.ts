import { describe, expect, it, vi } from 'vitest'
import { createDefaultConfig } from '../src/config.js'
import type { CallModelInput, ModelResponse } from '../src/llm-client.js'
import { DEFAULT_AFFECTIVE_PERSONA_CONTRACT } from '../src/affect/persona-contract.js'
import { compileResponseStrategy } from '../src/affect/response-strategy.js'
import { analyzeUserAffect } from '../src/affect/user-affect-analyzer.js'
import { buildContinuitySnapshot, formatContinuityPolicy } from '../src/affect/affect-runtime.js'

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
        communicationPreference: 'direct'
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

    expect(strategy.shouldChallengeUser).toBe(true)
    expect(strategy.shouldAvoidAnthropomorphism).toBe(true)
    expect(strategy.tone).toBe('technical')
    expect(strategy.safetyMode).toBe('normal')
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
    expect(snapshot.dissent.shouldChallenge).toBe(true)
    expect(policy).toContain('## Continuity Response Policy')
    expect(policy).toContain('Avoid claiming subjective emotion.')
    expect(policy).not.toContain('Cyrene feels')
  })
})
