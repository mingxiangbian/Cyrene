import type { AffectState, SyntheticAffectState } from './types.js'

export function deriveSyntheticAffect(affect: AffectState): SyntheticAffectState {
  const careful = affect.risk === 'high' ? 0.9 : affect.risk === 'medium' ? 0.7 : 0.35
  return {
    curiosity: affect.labels.includes('confused') ? 0.65 : 0.45,
    skepticism: affect.labels.includes('focused') || affect.labels.includes('high_focus') ? 0.55 : 0.35,
    concern: affect.labels.includes('distressed') || affect.labels.includes('angry') ? careful : 0.2,
    patience: affect.labels.includes('confused') || affect.labels.includes('distressed') ? 0.85 : 0.65
  }
}
