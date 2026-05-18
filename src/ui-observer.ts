import { basename } from 'node:path'
import chalk from 'chalk'

export interface AgentObserver {
  onThinkingStart(): void
  onThinkingStop(durationMs: number): void
  onToolCallStart(name: string, summary: string): void
  onToolCallResult(name: string, ok: boolean, durationMs: number, summary: string): void
  onResponse(text: string): void
}

export const PRISM_THEME = {
  colors: {
    fogWhite: '#F8FBFF',
    iceWhite: '#EAF7FF',
    paleCyan: '#DDF7F8',
    softPink: '#F7A8CF',
    lavender: '#D8B7FF',
    iceCyan: '#86E6F1',
    glassBlue: '#B7D7FF',
    ink: '#2F3545',
    muted: '#6F7A90'
  }
} as const

export function toolIcon(name: string): string {
  if (name === 'file_read' || name === 'grep' || name === 'glob') return '📖'
  if (name === 'file_edit' || name === 'file_write') return '✏️'
  if (name === 'bash') return '⚡'
  if (name === 'web_search') return '🌐'
  if (name === 'ask_user') return '💬'
  return '🔧'
}

export function truncateOneLine(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, Math.max(maxLength - 3, 0))}...`
}

export function toolCallSummary(name: string, argumentsText: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(argumentsText)
  } catch {
    return truncateOneLine(argumentsText, 40)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return truncateOneLine(argumentsText, 40)
  }

  const args = parsed as Record<string, unknown>

  const stringArg = (key: string): string | undefined => {
    const value = args[key]
    return typeof value === 'string' ? value : undefined
  }

  if (name === 'file_read' || name === 'file_write') {
    return basename(stringArg('file_path') ?? '')
  }
  if (name === 'file_edit') {
    const file = basename(stringArg('file_path') ?? '')
    const line = args.line
    return typeof line === 'number' ? `${file}:${line}` : file
  }
  if (name === 'grep' || name === 'glob') return truncateOneLine(stringArg('pattern') ?? '', 60)
  if (name === 'bash') return truncateOneLine(stringArg('command') ?? '', 60)
  if (name === 'web_search') return truncateOneLine(stringArg('query') ?? '', 60)
  if (name === 'ask_user') return truncateOneLine(stringArg('question') ?? '', 60)
  return truncateOneLine(argumentsText, 40)
}

function maybeColor(text: string, color: boolean, style: (input: string) => string): string {
  return color ? style(text) : text
}

export function renderPrismMascot(options: { color?: boolean } = {}): string {
  const color = options.color ?? true
  const pink = (text: string) => maybeColor(text, color, chalk.hex(PRISM_THEME.colors.softPink))
  const cyan = (text: string) => maybeColor(text, color, chalk.hex(PRISM_THEME.colors.iceCyan))
  const blue = (text: string) => maybeColor(text, color, chalk.hex(PRISM_THEME.colors.glassBlue))
  const violet = (text: string) => maybeColor(text, color, chalk.hex(PRISM_THEME.colors.lavender))
  const dim = (text: string) => maybeColor(text, color, chalk.hex(PRISM_THEME.colors.muted))

  return [
    `${violet('       ✦')} ${dim('prism agent')}`,
    `${pink('    ╭╲╲ pink hair ╱╱╮')} ${cyan('clip')}`,
    `${pink('   ╱  ◕     ◕   ╲')} ${violet('soft eyes')}`,
    `${pink('  │     ▿        │')} ${dim('daily ai')}`,
    `${pink('  ╰╮  braid  ╭╯')} ${pink('braid')}`,
    `${blue('    ╲ ice coat ╱')} ${cyan('✦')}`,
    `${blue('     ╰─ prism ─╯')}`
  ].join('\n')
}

export function renderWelcome(input: { modelName: string; color?: boolean }): string {
  const color = input.color ?? true
  const title = color
    ? `${chalk.hex(PRISM_THEME.colors.iceCyan)('cc-local')} ${chalk.hex(PRISM_THEME.colors.lavender)('·')} ${chalk.hex(PRISM_THEME.colors.softPink)('Prism Agent')}`
    : 'cc-local · Prism Agent'
  const model = color ? chalk.hex(PRISM_THEME.colors.muted)(`${input.modelName} · /help`) : `${input.modelName} · /help`
  return `${renderPrismMascot({ color })}\n${title}\n${model}`
}
