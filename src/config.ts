import { homedir } from 'node:os'
import { join } from 'node:path'

export interface ModelConfig {
  baseUrl: string
  model: string
  apiKey?: string
  temperature: number
}

export interface FeatureFlags {
  bashEnabled: boolean
  webSearchEnabled: boolean
  mcpEnabled: boolean
}

export interface AppConfig {
  cwd: string
  model: ModelConfig
  features: FeatureFlags
  maxToolCallsPerTurn: number
  contextWindowTokens: number
  autoCompactThreshold: number
  snipThreshold: number
  microcompactThreshold: number
  collapseThreshold: number
  snipKeepRounds: number
  microcompactKeepRecentRounds: number
  userCyreneDir: string
  dailyCompactThreshold: number
  dailyLoadLines: number
  dailySummaryMaxLength: number
  sessionResumeRecentMessages: number
  memoryMaxLines: number
  memoryMaxLineLength: number
  readMaxInlineLines: number
  grepMaxMatches: number
  bashTimeoutMs: number
  llmRequestTimeoutMs: number
  llmRetryMaxAttempts: number
  llmRetryBaseDelayMs: number
  readableRoots: string[]
  writableRoots: string[]
  bashDenyPatterns: RegExp[]
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue
  }
  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase())
}

function parsePositiveIntEnv(value: string | undefined, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

export function createDefaultConfig(cwd: string): AppConfig {
  return {
    cwd,
    model: {
      baseUrl: process.env.CYRENE_BASE_URL ?? '',
      model: process.env.CYRENE_MODEL ?? '',
      apiKey: process.env.CYRENE_API_KEY?.trim() === '' ? undefined : process.env.CYRENE_API_KEY,
      temperature: 0
    },
    features: {
      bashEnabled: parseBooleanEnv(process.env.CYRENE_ENABLE_BASH, true),
      webSearchEnabled: parseBooleanEnv(process.env.CYRENE_ENABLE_WEB_SEARCH, true),
      mcpEnabled: parseBooleanEnv(process.env.CYRENE_ENABLE_MCP, false)
    },
    maxToolCallsPerTurn: 10,
    contextWindowTokens: 256_000,
    autoCompactThreshold: 0.7,
    snipThreshold: 0.4,
    microcompactThreshold: 0.5,
    collapseThreshold: 0.6,
    snipKeepRounds: 15,
    microcompactKeepRecentRounds: 5,
    userCyreneDir: join(homedir(), '.cyrene'),
    dailyCompactThreshold: 500,
    dailyLoadLines: 200,
    dailySummaryMaxLength: 400,
    sessionResumeRecentMessages: 40,
    memoryMaxLines: 200,
    memoryMaxLineLength: 150,
    readMaxInlineLines: 500,
    grepMaxMatches: 30,
    bashTimeoutMs: 120_000,
    llmRequestTimeoutMs: 180_000,
    llmRetryMaxAttempts: 3,
    llmRetryBaseDelayMs: 1_000,
    readableRoots: [cwd],
    writableRoots: [cwd],
    bashDenyPatterns: [
      /\brm\b(?=.*(?:^|\s)-[A-Za-z]*r)(?=.*(?:^|\s)-[A-Za-z]*f).*\s(?:--\s+)?\//,
      /mkfs\./,
      /\bdd\b(?=.*\bof=\/dev\/sd[a-z]?\b)/,
      />\s*\/dev\/sd/,
      /\b(?:curl|wget)\b.*\|\s*(?:ba)?sh\b/,
      /:\(\)\s*\{\s*:\|:&\s*\};:/
    ]
  }
}
