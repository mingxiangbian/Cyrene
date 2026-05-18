import { describe, expect, it } from 'vitest'
import {
  PRISM_THEME,
  renderPrismMascot,
  renderWelcome,
  toolCallSummary,
  toolIcon,
  truncateOneLine
} from '../src/ui-observer.js'

describe('toolIcon', () => {
  it.each([
    ['file_read', '📖'],
    ['grep', '📖'],
    ['glob', '📖'],
    ['file_edit', '✏️'],
    ['file_write', '✏️'],
    ['bash', '⚡'],
    ['web_search', '🌐'],
    ['ask_user', '💬'],
    ['unknown', '🔧']
  ])('maps %s to %s', (name, expected) => {
    expect(toolIcon(name)).toBe(expected)
  })
})

describe('toolCallSummary', () => {
  it('summarizes file paths by basename', () => {
    expect(toolCallSummary('file_read', '{"file_path":"/tmp/project/package.json"}')).toBe('package.json')
    expect(toolCallSummary('file_write', '{"file_path":"src/ui-observer.ts"}')).toBe('ui-observer.ts')
  })

  it('summarizes grep, glob, bash, web search, and ask_user arguments', () => {
    expect(toolCallSummary('grep', '{"pattern":"runAgentLoop"}')).toBe('runAgentLoop')
    expect(toolCallSummary('glob', '{"pattern":"src/**/*.ts"}')).toBe('src/**/*.ts')
    expect(toolCallSummary('bash', '{"command":"npm test\\n npm run typecheck"}')).toBe('npm test npm run typecheck')
    expect(toolCallSummary('web_search', '{"query":"terminal glassmorphism ansi ui"}')).toBe('terminal glassmorphism ansi ui')
    expect(toolCallSummary('ask_user', '{"question":"Pick a rendering style"}')).toBe('Pick a rendering style')
  })

  it('includes a line hint for file_edit when present', () => {
    expect(toolCallSummary('file_edit', '{"file_path":"src/repl.ts","line":85}')).toBe('repl.ts:85')
  })

  it('falls back to compact raw text when JSON parsing fails', () => {
    expect(toolCallSummary('bash', 'not-json-with-a-very-long-value-that-keeps-going')).toBe(
      'not-json-with-a-very-long-value-that-...'
    )
  })

  it('falls back safely for valid non-object JSON', () => {
    expect(toolCallSummary('bash', 'null')).toBe('null')
  })

  it('falls back when known tools receive the wrong fields', () => {
    expect(toolCallSummary('bash', '{"cmd":"ls"}')).toBe('{"cmd":"ls"}')
    expect(toolCallSummary('file_read', '{"path":"/tmp/a"}')).toBe('{"path":"/tmp/a"}')
  })
})

describe('Prism render helpers', () => {
  it('keeps one-line summaries compact', () => {
    expect(truncateOneLine('abc\ndef', 20)).toBe('abc def')
    expect(truncateOneLine('x'.repeat(65), 60)).toBe(`${'x'.repeat(57)}...`)
  })

  it('exports the approved Prism palette', () => {
    expect(PRISM_THEME.colors).toEqual({
      fogWhite: '#F8FBFF',
      iceWhite: '#EAF7FF',
      paleCyan: '#DDF7F8',
      softPink: '#F7A8CF',
      lavender: '#D8B7FF',
      iceCyan: '#86E6F1',
      glassBlue: '#B7D7FF',
      ink: '#2F3545',
      muted: '#6F7A90'
    })
  })

  it('renders a high-recognition mascot with hair, braid, clip, coat, and prism accents', () => {
    const mascot = renderPrismMascot({ color: false })
    expect(mascot).toContain('pink hair')
    expect(mascot).toContain('clip')
    expect(mascot).toContain('braid')
    expect(mascot).toContain('ice coat')
    expect(mascot).toContain('✦')
  })

  it('renders a welcome block with mascot, model, and help hint', () => {
    const welcome = renderWelcome({
      modelName: 'Qwen3.5-9B-MLX-4bit',
      color: false
    })
    expect(welcome).toContain('cc-local')
    expect(welcome).toContain('Prism Agent')
    expect(welcome).toContain('Qwen3.5-9B-MLX-4bit')
    expect(welcome).toContain('/help')
  })
})
