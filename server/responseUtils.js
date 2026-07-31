export function buildFallbackAssistantReply(userPrompt = '') {
  const trimmedPrompt = userPrompt.trim()

  if (!trimmedPrompt) {
    return 'I am currently unavailable, but I can help as soon as the AI service is reachable again.'
  }

  return `I am unable to reach the AI service right now. Please try again in a moment. Your request was: ${trimmedPrompt}`
}
