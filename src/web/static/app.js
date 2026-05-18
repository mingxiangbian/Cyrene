const form = document.querySelector('#run-form')
const promptInput = document.querySelector('#prompt')
const events = document.querySelector('#events')

form?.addEventListener('submit', async (event) => {
  event.preventDefault()
  const content = promptInput?.value?.trim()
  if (!content) {
    return
  }

  events.replaceChildren()
  const response = await fetch('/api/runs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content }] })
  })

  if (!response.ok) {
    appendEvent('error', await response.text())
    return
  }

  const { runId } = await response.json()
  const stream = new EventSource(`/api/runs/${runId}/events`)
  for (const type of ['thinking_start', 'thinking_stop', 'tool_start', 'tool_result', 'final', 'error']) {
    stream.addEventListener(type, (message) => {
      const data = JSON.parse(message.data)
      appendEvent(type, data.text ?? data.summary ?? data.message ?? type)
      if (type === 'final' || type === 'error') {
        stream.close()
      }
    })
  }
})

function appendEvent(type, text) {
  const node = document.createElement('div')
  node.className = 'event'
  node.textContent = `${type}: ${text}`
  events.append(node)
}
