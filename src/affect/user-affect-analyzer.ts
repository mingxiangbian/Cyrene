import type { AnalyzeUserAffectInput, AffectLabel, AffectRisk, AffectState, ResponseNeed } from './types.js'

const ALLOWED_LABELS = new Set<AffectLabel>([
  'neutral',
  'focused',
  'high_focus',
  'confused',
  'distressed',
  'frustrated',
  'angry',
  'uncertain',
  'urgent'
])

const ALLOWED_RESPONSE_NEEDS = new Set<ResponseNeed>([
  'normal',
  'lower_cognitive_load',
  'simplify_and_structure',
  'deescalate_and_clarify',
  'technical_directness',
  'concise_execution'
])

const ALLOWED_RISKS = new Set<AffectRisk>(['low', 'medium', 'high'])

export async function analyzeUserAffect(input: AnalyzeUserAffectInput): Promise<AffectState> {
  if (input.callModel !== undefined && input.config !== undefined) {
    const modelAffect = await analyzeWithModel(input).catch(() => null)
    if (modelAffect !== null) {
      return modelAffect
    }
  }

  return analyzeWithRules(input.userMessage)
}

async function analyzeWithModel(input: AnalyzeUserAffectInput): Promise<AffectState> {
  if (input.config === undefined || input.callModel === undefined) {
    return analyzeWithRules(input.userMessage)
  }

  const response = await input.callModel({
    config: input.config,
    tools: [],
    useCase: 'affect_analysis',
    messages: [
      {
        role: 'system',
        content: [
          'Analyze the user message for response strategy only.',
          'Return compact JSON with labels, intensity, confidence, responseNeed, risk, rationale.',
          'Do not emit medical, therapeutic, or diagnostic labels.'
        ].join('\n')
      },
      { role: 'user', content: input.userMessage }
    ]
  })

  return sanitizeAffect(JSON.parse(response.content) as Partial<AffectState>, analyzeWithRules(input.userMessage))
}

function analyzeWithRules(userMessage: string): AffectState {
  const text = userMessage.toLowerCase()
  const labels = new Set<AffectLabel>()

  if (matchesAny(text, ['崩', '崩溃', '撑不住', '压力', '难受', 'overwhelmed'])) {
    labels.add('distressed')
  }
  if (matchesAny(text, ['没看懂', '不懂', '不知道', '困惑', 'confused', 'clarify'])) {
    labels.add('confused')
  }
  if (matchesAny(text, ['烦', '生气', '火大', 'angry'])) {
    labels.add('angry')
  }
  if (matchesAny(text, ['卡住', '失败', '不对', 'frustrated'])) {
    labels.add('frustrated')
  }
  if (matchesAny(text, ['马上', '立刻', '紧急', 'urgent'])) {
    labels.add('urgent')
  }
  if (matchesAny(text, ['直接', '实现', '代码', '测试', '执行', 'technical', 'implement'])) {
    labels.add('focused')
  }
  if (matchesAny(text, ['别废话', '高效', '直接执行', 'high focus'])) {
    labels.add('high_focus')
  }
  if (labels.size === 0) {
    labels.add('neutral')
  }

  return {
    labels: [...labels],
    intensity: labels.has('distressed') || labels.has('angry') ? 0.75 : labels.has('confused') ? 0.55 : 0.35,
    confidence: 0.65,
    responseNeed: responseNeedForLabels(labels),
    risk: labels.has('distressed') || labels.has('angry') ? 'medium' : 'low',
    rationale: 'Rule-based affect estimate for response strategy only.'
  }
}

function sanitizeAffect(candidate: Partial<AffectState>, fallback: AffectState): AffectState {
  const labels = Array.isArray(candidate.labels)
    ? candidate.labels.filter((label): label is AffectLabel => ALLOWED_LABELS.has(label as AffectLabel))
    : fallback.labels
  const safeLabels = labels.length === 0 ? fallback.labels : labels
  const responseNeed = ALLOWED_RESPONSE_NEEDS.has(candidate.responseNeed as ResponseNeed)
    ? candidate.responseNeed as ResponseNeed
    : fallback.responseNeed
  const risk = ALLOWED_RISKS.has(candidate.risk as AffectRisk) ? candidate.risk as AffectRisk : fallback.risk

  return {
    labels: safeLabels,
    intensity: clampNumber(candidate.intensity, fallback.intensity),
    confidence: clampNumber(candidate.confidence, fallback.confidence),
    responseNeed,
    risk,
    rationale: typeof candidate.rationale === 'string' && candidate.rationale.trim() !== ''
      ? candidate.rationale.trim()
      : fallback.rationale
  }
}

function responseNeedForLabels(labels: Set<AffectLabel>): ResponseNeed {
  if (labels.has('distressed')) return 'lower_cognitive_load'
  if (labels.has('angry') || labels.has('frustrated')) return 'deescalate_and_clarify'
  if (labels.has('confused')) return 'simplify_and_structure'
  if (labels.has('high_focus')) return 'concise_execution'
  if (labels.has('focused')) return 'technical_directness'
  return 'normal'
}

function matchesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle))
}

function clampNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback
}
