export function buildOpenAIMessageHistory(messages) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: message.content
    }))
}

export function getLatestUserPrompt(messages) {
  const latest = [...messages].reverse().find((message) => message.role === 'user')
  return latest?.content ?? ''
}
