#!/usr/bin/env -S npx tsx
import { Command } from 'commander'
import { runAgentLoop } from './agent-loop.js'
import { runRepl } from './repl.js'
import { createTerminalObserver } from './ui-observer.js'
import { buildAgentRuntime } from './web/prompt-context.js'

const program = new Command()

async function main(): Promise<void> {
  program
    .name('cc-local')
    .description('Local Claude Code-style agent powered by an OpenAI-compatible MLX server.')
    .argument('[prompt...]', 'task for the agent')
    .option('--cwd <path>', 'working directory', process.cwd())
    .option('--repl', 'start an interactive session')

  program.parse()

  const options = program.opts<{ cwd: string; repl?: boolean }>()
  const prompt = program.args.join(' ').trim()
  if (!options.repl && !prompt) {
    console.error('Prompt cannot be empty.')
    process.exit(1)
  }

  const { config, systemPrompt, tools } = await buildAgentRuntime(options.cwd)

  if (options.repl) {
    await runRepl({ config, systemPrompt, tools })
    return
  }

  const observer = createTerminalObserver(process.stderr, { spinner: false, responseDivider: false })
  const result = await runAgentLoop({
    config,
    observer,
    systemPrompt,
    userPrompt: prompt,
    tools
  })

  console.log(result.finalText)
  if (result.toolCallCount > 0) {
    console.error(`tool calls: ${result.toolCallCount}`)
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
