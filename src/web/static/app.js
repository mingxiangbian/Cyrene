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
  stream.addEventListener('message', (message) => {
    const data = JSON.parse(message.data)
    appendEvent(data.type, eventText(data))
    if (data.type === 'final' || data.type === 'error') {
      stream.close()
    }
  })
})

function eventText(data) {
  switch (data.type) {
    case 'final':
      return data.text
    case 'error':
      return data.message
    case 'tool_start':
    case 'tool_result':
      return data.summary
    default:
      return data.type
  }
}

function appendEvent(type, text) {
  const node = document.createElement('div')
  node.className = 'event'
  node.textContent = `${type}: ${text}`
  events.append(node)
}
