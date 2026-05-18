import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { runAgentLoop } from '../agent-loop.js'
import type { CallModelInput, ChatMessage, ChatRole, ModelResponse } from '../llm-client.js'
import { buildAgentRuntime } from './prompt-context.js'
import { createWebObserver, errorEvent, type WebRunEvent } from './web-observer.js'

export interface StartWebServerInput {
  cwd: string
  host: string
  port: number
  callModel?: (input: CallModelInput) => Promise<ModelResponse>
}

export interface WebServerHandle {
  url: string
  close: () => Promise<void>
}

interface RunRecord {
  id: string
  messages: ChatMessage[]
  events: WebRunEvent[]
  clients: Set<ServerResponse>
  done: boolean
}

const currentFile = fileURLToPath(import.meta.url)
const staticDir = resolve(dirname(currentFile), 'static')
const validRoles = new Set<ChatRole>(['system', 'user', 'assistant', 'tool'])

export async function startWebServer(input: StartWebServerInput): Promise<WebServerHandle> {
  const runtime = await buildAgentRuntime(input.cwd)
  const runs = new Map<string, RunRecord>()

  const server = createServer((request, response) => {
    void routeRequest(request, response, {
      callModel: input.callModel,
      runs,
      runtime
    })
  })

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(input.port, input.host, () => {
      server.off('error', rejectListen)
      resolveListen()
    })
  })

  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Web server did not bind to a TCP address.')
  }

  return {
    url: `http://${input.host}:${(address as AddressInfo).port}`,
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        for (const run of runs.values()) {
          for (const client of run.clients) {
            client.end()
          }
          run.clients.clear()
        }
        server.close((error) => {
          if (error) {
            rejectClose(error)
            return
          }
          resolveClose()
        })
      })
  }
}

async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: {
    callModel?: (input: CallModelInput) => Promise<ModelResponse>
    runs: Map<string, RunRecord>
    runtime: Awaited<ReturnType<typeof buildAgentRuntime>>
  }
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://localhost')

  if (request.method === 'GET' && url.pathname === '/') {
    await serveStaticFile(response, 'index.html')
    return
  }

  if (request.method === 'GET' && url.pathname.startsWith('/static/')) {
    await serveStaticFile(response, url.pathname.slice('/static/'.length))
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/runs') {
    await createRun(request, response, context)
    return
  }

  const eventMatch = /^\/api\/runs\/([^/]+)\/events$/.exec(url.pathname)
  if (request.method === 'GET' && eventMatch !== null) {
    streamRunEvents(request, response, context.runs, eventMatch[1])
    return
  }

  writeJson(response, 404, { error: 'Not found.' })
}

async function createRun(
  request: IncomingMessage,
  response: ServerResponse,
  context: {
    callModel?: (input: CallModelInput) => Promise<ModelResponse>
    runs: Map<string, RunRecord>
    runtime: Awaited<ReturnType<typeof buildAgentRuntime>>
  }
): Promise<void> {
  let body: unknown
  try {
    body = JSON.parse(await readRequestBody(request))
  } catch {
    writeJson(response, 400, { error: 'Invalid JSON body.' })
    return
  }

  const messages = parseMessages(body)
  if (messages.length === 0 || !messages.some((message) => message.role === 'user' && message.content.trim().length > 0)) {
    writeJson(response, 400, { error: 'At least one user message is required.' })
    return
  }

  const record: RunRecord = {
    id: randomUUID(),
    messages,
    events: [],
    clients: new Set(),
    done: false
  }
  context.runs.set(record.id, record)
  writeJson(response, 202, { runId: record.id })

  queueMicrotask(() => {
    void runWebAgent(record, context.runtime, context.callModel)
  })
}

async function runWebAgent(
  record: RunRecord,
  runtime: Awaited<ReturnType<typeof buildAgentRuntime>>,
  callModel?: (input: CallModelInput) => Promise<ModelResponse>
): Promise<void> {
  try {
    await runAgentLoop({
      config: runtime.config,
      tools: runtime.tools,
      messages: [...record.messages],
      observer: createWebObserver((event) => emit(record, event)),
      callModel
    })
  } catch (error) {
    emit(record, errorEvent(error))
  }
}

function emit(record: RunRecord, event: WebRunEvent): void {
  record.events.push(event)

  for (const client of record.clients) {
    writeSseEvent(client, event)
  }

  if (event.type === 'final' || event.type === 'error') {
    record.done = true
    for (const client of record.clients) {
      client.end()
    }
    record.clients.clear()
  }
}

function streamRunEvents(
  request: IncomingMessage,
  response: ServerResponse,
  runs: Map<string, RunRecord>,
  runId: string
): void {
  const record = runs.get(runId)
  if (record === undefined) {
    writeJson(response, 404, { error: 'Run not found.' })
    return
  }

  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive'
  })

  for (const event of record.events) {
    writeSseEvent(response, event)
  }

  if (record.done) {
    response.end()
    return
  }

  record.clients.add(response)
  request.on('close', () => {
    record.clients.delete(response)
  })
}

function writeSseEvent(response: ServerResponse, event: WebRunEvent): void {
  response.write(`event: ${event.type}\n`)
  response.write(`data: ${JSON.stringify(event)}\n\n`)
}

function parseMessages(body: unknown): ChatMessage[] {
  if (!isObject(body) || !Array.isArray(body.messages)) {
    return []
  }

  const messages: ChatMessage[] = []
  for (const message of body.messages) {
    if (!isObject(message) || typeof message.role !== 'string' || !validRoles.has(message.role as ChatRole) || typeof message.content !== 'string') {
      return []
    }

    const role = message.role as ChatRole
    if (message.role === 'tool') {
      if (typeof message.tool_call_id !== 'string' || message.tool_call_id.length === 0) {
        return []
      }
      messages.push({ role, content: message.content, tool_call_id: message.tool_call_id })
      continue
    }

    messages.push({ role, content: message.content })
  }

  return messages
}

async function serveStaticFile(response: ServerResponse, relativePath: string): Promise<void> {
  const normalizedPath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '')
  const filePath = resolve(staticDir, normalizedPath)
  if (filePath !== staticDir && !filePath.startsWith(`${staticDir}${sep}`)) {
    writeJson(response, 404, { error: 'Not found.' })
    return
  }

  try {
    await readFile(filePath)
  } catch {
    writeJson(response, 404, { error: 'Not found.' })
    return
  }

  response.writeHead(200, { 'content-type': contentTypeFor(filePath) })
  createReadStream(filePath).pipe(response)
}

function contentTypeFor(filePath: string): string {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

function readRequestBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    request.on('error', rejectBody)
  })
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
