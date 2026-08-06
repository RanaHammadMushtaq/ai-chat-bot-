export function buildGeminiHistory(messages) {
  const history = messages
    .filter((message) => (
      (message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string'
      && message.content.trim()
    ))
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content.trim() }]
    }))

  // Gemini conversations must begin with a user turn. The UI greeting is local-only.
  const firstUserTurn = history.findIndex((message) => message.role === 'user')
  return firstUserTurn === -1 ? [] : history.slice(firstUserTurn)
}

export function getLatestUserPrompt(messages) {
  const latest = [...messages].reverse().find((message) => (
    message.role === 'user' && typeof message.content === 'string' && message.content.trim()
  ))
  return latest?.content?.trim() ?? ''
}

export function buildOpenAIMessageHistory(messages) {
  return messages
    .filter((message) => (
      (message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string'
      && message.content.trim()
    ))
    .map((message) => ({
      role: message.role,
      content: message.content.trim()
    }))
  }