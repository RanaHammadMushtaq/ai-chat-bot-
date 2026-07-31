// Keep model settings and the system prompt together so the streaming route stays easy to extend.
// This ai-bot project is configured to use Gemini for the streaming chat experience.
export const SYSTEM_PROMPT = `You are a calm, helpful AI assistant for a product reviewer. Speak clearly, answer directly, and keep suggestions concise.`

export const MODEL_CONFIG = {
  model: 'gemini-2.0-flash',
  max_tokens: 220,
  temperature: 0.7
}
