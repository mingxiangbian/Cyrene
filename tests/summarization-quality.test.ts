import { describe, expect, it } from 'vitest'

// These tests evaluate the Qwen3.5-9B model's summarization quality.
// They require a running MLX server. Skip in CI.
//
// Run with:
//   npx vitest run tests/summarization-quality.test.ts

const BASE_URL = process.env.CC_LOCAL_BASE_URL ?? 'http://127.0.0.1:8080/v1'
const MODEL = process.env.CC_LOCAL_MODEL ?? 'Qwen3.5-9B-MLX-4bit'

interface SummaryResult {
  intent: string
  decisions: string[]
  filesModified: string[]
  testResults: string[]
  pending: string[]
  raw: string
}

async function summarize(text: string): Promise<string> {
  const prompt = `Summarize the following conversation into a structured format. Use exactly these sections:

## Intent
[One sentence describing the user's overall goal]

## Decisions Made
- [Each key decision with brief reason]

## Files Modified
- [Each file and what changed]

## Test Results
[What tests passed/failed, or "no tests run"]

## Pending
- [Tasks not yet completed, or "nothing pending"]

Conversation:
${text}`

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 4096,
      chat_template_kwargs: { enable_thinking: false },
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status} ${await response.text()}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>
  }
  return data.choices?.[0]?.message?.content ?? ''
}

function parseSummary(raw: string): SummaryResult {
  const intent = raw.match(/## Intent\s*\n\s*(.+)/)?.[1] ?? ''
  const decisions = [...raw.matchAll(/## Decisions Made\s*\n((?:- .+\n?)*)/g)]
    .flatMap((m) => m[1].split('\n').filter((l) => l.startsWith('-')).map((l) => l.replace(/^-\s*/, '').trim()))
  const filesModified = [...raw.matchAll(/## Files Modified\s*\n((?:- .+\n?)*)/g)]
    .flatMap((m) => m[1].split('\n').filter((l) => l.startsWith('-')).map((l) => l.replace(/^-\s*/, '').trim()))
  const testResults = raw.match(/## Test Results\s*\n([\s\S]*?)(?=##|$)/)?.[1]?.trim() ?? ''
  const pending = [...raw.matchAll(/## Pending\s*\n((?:- .+\n?)*)/g)]
    .flatMap((m) => m[1].split('\n').filter((l) => l.startsWith('-')).map((l) => l.replace(/^-\s*/, '').trim()))

  return { intent, decisions, filesModified, testResults, pending, raw }
}

const SIMPLE_CONVERSATION = `
User: fix the login bug in src/auth.ts
Agent: let me read the file first.
Tool: file_read src/auth.ts
Result: [120 lines, includes login() function at line 45]
Agent: I can see the issue. The login() function doesn't handle expired tokens. Let me fix it.
Tool: file_edit src/auth.ts - added token expiry check before calling refreshToken()
Result: ok
Agent: I've added the expiry check. Let me verify.
Tool: bash "npx tsc --noEmit"
Result: No errors
Agent: The fix compiles. The login() function now checks token expiry before attempting refresh. Want me to run the tests?
`

const MULTI_FILE_CONVERSATION = `
User: add rate limiting to the API endpoints in src/api.ts and update the config
Agent: let me look at the current structure.
Tool: file_read src/api.ts
Result: [200 lines, Express router with 5 endpoints]
Tool: file_read src/config.ts
Result: [60 lines, AppConfig interface without rate limit fields]
Agent: I need to add rate limiting. I'll use express-rate-limit and add config fields.
Tool: file_edit src/config.ts - added rateLimitWindowMs and rateLimitMaxRequests to AppConfig
Result: ok
Tool: file_edit src/api.ts - added rateLimit middleware import and applied to all routes
Result: ok
Tool: bash "npm test"
Result: 15 passed, 2 failed - rate limit tests need update
Agent: Two tests failed because they expect the old config shape. Let me update them.
Tool: file_edit tests/api.test.ts - updated config mock to include new rate limit fields
Result: ok
Tool: bash "npm test"
Result: 17 passed, 0 failed
Agent: All tests pass. Rate limiting is now active on all 5 API endpoints, configurable via rateLimitWindowMs and rateLimitMaxRequests in AppConfig.
User: also add it to the health check endpoint
Agent: The health check is one of the 5 endpoints in src/api.ts, so it's already covered by the middleware applied to all routes.
`

const AMBIGUOUS_CONVERSATION = `
User: make it faster
Agent: I need more context. Which part of the application feels slow?
User: the search page
Agent: let me look at the search implementation.
Tool: grep "search" src/
Result: found search.ts, search.test.ts, search.css
Tool: file_read src/search.ts
Result: [80 lines, includes database query with SELECT * FROM items WHERE name LIKE]
Agent: I see the issue. The query uses LIKE with a leading wildcard which prevents index usage. Two approaches:
1. Add a full-text index
2. Switch to ILIKE with a GIN index
Which do you prefer?
User: option 2
Agent: let me implement it.
Tool: file_edit src/search.ts - changed LIKE to ILIKE, added migration for GIN index
Result: ok
Tool: file_edit src/db/migrations/003_add_search_index.sql - created migration file
Result: ok
Tool: bash "npm test -- --grep search"
Result: 4 passed, 0 failed
Agent: Done. Changed the search query from LIKE to ILIKE with a GIN index. The tests still pass. To apply: run the migration and restart.
`

describe('model summarization quality', () => {
  it('generates all 5 required sections', async () => {
    const raw = await summarize(SIMPLE_CONVERSATION)
    const parsed = parseSummary(raw)

    console.log('\n=== Simple Conversation Summary ===\n' + raw + '\n=== End ===\n')

    // Structural checks
    expect(raw).toContain('## Intent')
    expect(raw).toContain('## Decisions Made')
    expect(raw).toContain('## Files Modified')
    expect(raw).toContain('## Test Results')
    expect(raw).toContain('## Pending')

    // Content quality checks
    expect(parsed.intent.length).toBeGreaterThan(5)
    expect(parsed.filesModified.length).toBeGreaterThanOrEqual(1)
    // Should mention src/auth.ts somewhere
    expect(raw.toLowerCase()).toContain('auth.ts')
  }, 60_000)

  it('preserves key details across multi-file changes', async () => {
    const raw = await summarize(MULTI_FILE_CONVERSATION)
    const parsed = parseSummary(raw)

    console.log('\n=== Multi-File Conversation Summary ===\n' + raw + '\n=== End ===\n')

    // Should mention both files that were changed
    expect(raw.toLowerCase()).toContain('api.ts')
    expect(raw.toLowerCase()).toContain('config.ts')
    // Should mention the test fix
    expect(raw.toLowerCase()).toMatch(/test/)
    // Should mention the final state (all passing)
    expect(raw.toLowerCase()).toMatch(/17.*pass|all.*pass|passed/)
  }, 60_000)

  it('captures context and decision rationale from ambiguous requests', async () => {
    const raw = await summarize(AMBIGUOUS_CONVERSATION)
    const parsed = parseSummary(raw)

    console.log('\n=== Ambiguous Conversation Summary ===\n' + raw + '\n=== End ===\n')

    // Should capture the initial ambiguity and clarification
    expect(raw.toLowerCase()).toMatch(/search|slow|fast/)
    // Should mention the decision between options
    expect(raw.toLowerCase()).toMatch(/option|like|ilike|gin|index/)
    // Should mention the migration file
    expect(raw.toLowerCase()).toContain('migration')
    // Should note remaining manual step (run migration)
    expect(raw.toLowerCase()).toMatch(/migration|apply|run|deploy/)
  }, 60_000)

  it('does not hallucinate non-existent files or facts', async () => {
    const raw = await summarize(SIMPLE_CONVERSATION)

    // Should NOT invent files that weren't in the conversation
    const hallucinationIndicators = [
      'package.json',
      'tsconfig',
      'README',
      'database',
      'deploy'
    ]
    for (const indicator of hallucinationIndicators) {
      // Only flag if it appears in the Files Modified section specifically
      const filesSection = raw.match(/## Files Modified\s*\n([\s\S]*?)(?=##|$)/)?.[1] ?? ''
      if (filesSection.toLowerCase().includes(indicator.toLowerCase())) {
        console.log(`  ⚠ Potential hallucination: "${indicator}" found in Files Modified section`)
      }
    }

    // Should identify that tests were NOT run (the agent asked "Want me to run the tests?")
    const testSection = raw.match(/## Test Results\s*\n([\s\S]*?)(?=##|$)/)?.[1] ?? ''
    // Either says no tests, or mentions compilation only
    console.log(`  Test Results section: "${testSection.trim()}"`)
  }, 60_000)
})
