import { formatCodexDoctor } from './codex-doctor.js'
import { formatCodexStopHookInstall, installCodexStopHook } from './codex-hook-install.js'
import { handleCodexStopHookCommand } from './codex-hook-stop.js'
import { installCodexDevBridge } from './codex-install.js'

export async function handleCodexCommand(input: { cwd: string; args: string[] }): Promise<void> {
  const command = input.args[0]
  if (command === 'doctor') {
    process.stdout.write(await formatCodexDoctor({ cwd: input.cwd, configPath: parseConfigPath(input.args) }))
    return
  }

  if (command === 'install' && input.args[1] === '--dev') {
    process.stdout.write(await installCodexDevBridge())
    return
  }

  if (command === 'install-hook' && input.args[1] === '--stop') {
    const dryRun = input.args.includes('--dry-run')
    process.stdout.write(dryRun ? await formatCodexStopHookInstall({ dryRun: true }) : await installCodexStopHook({}))
    return
  }

  if (command === 'hook' && input.args[1] === 'stop') {
    process.stdout.write(await handleCodexStopHookCommand())
    return
  }

  console.error('Usage: cyrene codex <doctor [--config <path>]|install --dev|install-hook --stop [--dry-run]|hook stop>')
  process.exit(1)
}

function parseConfigPath(args: string[]): string | undefined {
  const index = args.indexOf('--config')
  if (index >= 0) {
    return args[index + 1]
  }
  const inline = args.find((arg) => arg.startsWith('--config='))
  return inline?.slice('--config='.length)
}
