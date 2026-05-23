import { Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  PRISM_THEME,
  createTerminalObserver,
  renderPrismMascot,
  renderWelcome,
  toolCallSummary,
  toolIcon,
  truncateOneLine
} from '../src/ui-observer.js'

class MemoryOutput extends Writable {
  columns = 60
  chunks: string[] = []

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(chunk.toString())
    callback()
  }

  text(): string {
    return this.chunks.join('')
  }
}

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
    expect(welcome).toContain('Cyrene')
    expect(welcome).toContain('Prism Agent')
    expect(welcome).toContain('Qwen3.5-9B-MLX-4bit')
    expect(welcome).toContain('/help')
  })
})

describe('createTerminalObserver', () => {
  it('renders a tool success on one line', () => {
    const output = new MemoryOutput()
    const observer = createTerminalObserver(output, { color: false })

    observer.onToolCallStart('file_read', 'package.json')
    observer.onToolCallResult('file_read', true, 300, '')

    expect(output.text()).toContain('📖 file_read · package.json')
    expect(output.text()).toContain('✓ 0.3s')
  })

  it('renders a tool failure with a truncated summary', () => {
    const output = new MemoryOutput()
    const observer = createTerminalObserver(output, { color: false })

    observer.onToolCallStart('bash', 'npm test')
    observer.onToolCallResult('bash', false, 1200, 'x'.repeat(100))

    expect(output.text()).toContain('⚡ bash · npm test')
    expect(output.text()).toContain('✗')
    expect(output.text()).toContain(`${'x'.repeat(77)}...`)
  })

  it('stops thinking spinner writes after stop', () => {
    vi.useFakeTimers()
    try {
      const output = new MemoryOutput()
      const observer = createTerminalObserver(output, { color: false })

      observer.onThinkingStart()
      vi.advanceTimersByTime(1000)
      observer.onThinkingStop(1000)
      const stoppedText = output.text()
      vi.advanceTimersByTime(2000)

      expect(stoppedText).toContain('Thinking')
      expect(output.text()).toBe(stoppedText)
    } finally {
      vi.useRealTimers()
    }
  })

  it('prints a divider without printing the final response text', () => {
    const output = new MemoryOutput()
    const observer = createTerminalObserver(output, { color: false })

    observer.onResponse('final answer')

    expect(output.text()).toContain('─')
    expect(output.text()).not.toContain('final answer')
  })
})
