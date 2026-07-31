import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFallbackAssistantReply } from './responseUtils.js'

test('buildFallbackAssistantReply returns a helpful fallback response', () => {
  const reply = buildFallbackAssistantReply('Summarize this idea')
  assert.match(reply, /Gemini|try again|help/i)
})
