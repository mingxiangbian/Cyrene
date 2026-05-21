import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'

function runPython(args: string[], input?: string): Promise<{ code: number | null, stdout: string, stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', args, {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(input ?? '')
  })
}

describe('t2i worker smoke', () => {
  it('prints help without loading diffusion dependencies', async () => {
    const result = await runPython(['scripts/t2i-worker.py', '--help'])

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Local SD1.5 text-to-image worker')
    expect(result.stdout).toContain('--model-path')
    expect(result.stdout).toContain('--port')
  })

  it('parses malformed request bodies as JSON errors', async () => {
    const result = await runPython(['-'], String.raw`
import importlib.util
import io
import json

spec = importlib.util.spec_from_file_location("t2i_worker", "scripts/t2i-worker.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Handler:
    def __init__(self, content_length, body):
        self.headers = {"content-length": content_length}
        self.rfile = io.BytesIO(body)

cases = [
    Handler("not-a-number", b"{}"),
    Handler("1", b"\xff"),
    Handler("1", b"{"),
]

print(json.dumps([module.read_json_body(case)[1] for case in cases]))
`)

    expect(result.code).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual([
      'Invalid content length.',
      'Invalid JSON body.',
      'Invalid JSON body.'
    ])
  })
})
