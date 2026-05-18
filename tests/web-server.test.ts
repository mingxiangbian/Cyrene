import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CallModelInput, ModelResponse } from '../src/llm-client.js'
import { startWebServer, type WebServerHandle } from '../src/web/server.js'

const servers: WebServerHandle[] = []
const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()))
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('startWebServer', () => {
  it('starts on an ephemeral port and closes cleanly', async () => {
    const cwd = await createTempCwd()
    const server = await startWebServer({
      cwd,
      host: '127.0.0.1',
      port: 0,
      callModel: async (): Promise<ModelResponse> => ({ content: 'unused', toolCalls: [] })
    })
    servers.push(server)

    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

    await server.close()
    servers.pop()
  })

  it('serves the static shell from GET /', async () => {
    const server = await startServer()

    const response = await fetch(server.url)
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(body).toContain('Prism Console')
    expect(body).toContain('app.js')
    expect(body).toContain('styles.css')
  })

  it('rejects run creation without a user message', async () => {
    const server = await startServer()

    const response = await fetch(`${server.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] })
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'At least one user message is required.' })
  })

  it('creates a run and streams prior and final run events over SSE', async () => {
    const callModel = vi.fn(async (): Promise<ModelResponse> => ({ content: 'web answer', toolCalls: [] }))
    const server = await startServer(callModel)

    const createResponse = await fetch(`${server.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello web' }] })
    })
    const createBody = (await createResponse.json()) as { runId: string }

    expect(createResponse.status).toBe(202)
    expect(createBody.runId).toEqual(expect.any(String))

    const streamResponse = await fetch(`${server.url}/api/runs/${createBody.runId}/events`)
    const streamBody = await streamResponse.text()

    expect(streamResponse.status).toBe(200)
    expect(streamResponse.headers.get('content-type')).toContain('text/event-stream')
    expect(streamBody).toContain('event: message')
    expect(streamBody).toContain('"type":"thinking_start"')
    expect(streamBody).toContain('"type":"final","text":"web answer"')
    expect(callModel).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([{ role: 'user', content: 'hello web' }])
    } satisfies Partial<CallModelInput>))
  })

  it('returns 404 for an unknown run event stream', async () => {
    const server = await startServer()

    const response = await fetch(`${server.url}/api/runs/missing/events`)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Run not found.' })
  })
})

async function startServer(callModel?: (input: CallModelInput) => Promise<ModelResponse>): Promise<WebServerHandle> {
  const cwd = await createTempCwd()
  const server = await startWebServer({
    cwd,
    host: '127.0.0.1',
    port: 0,
    callModel: callModel ?? (async (): Promise<ModelResponse> => ({ content: 'unused', toolCalls: [] }))
  })
  servers.push(server)
  return server
}

async function createTempCwd(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'cc-local-web-server-'))
  tempDirs.push(cwd)
  return cwd
}
