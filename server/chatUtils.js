export function buildGeminiMessages(messages) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    }))
}

export function getLatestUserPrompt(messages) {
  const latest = [...messages].reverse().find((message) => message.role === 'user')
  return latest?.content ?? ''
}
