import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGeminiHistory, getLatestUserPrompt } from './chatUtils.js'

test('buildGeminiHistory uses Gemini roles and ignores the local welcome message', () => {
  const history = buildGeminiHistory([
    { role: 'assistant', content: 'Welcome' },
    { role: 'user', content: '  Compare these products  ' },
    { role: 'assistant', content: 'Share the products.' }
  ])

  assert.deepEqual(history, [
    { role: 'user', parts: [{ text: 'Compare these products' }] },
    { role: 'model', parts: [{ text: 'Share the products.' }] }
  ])
})

test('getLatestUserPrompt returns the latest non-empty user message', () => {
  assert.equal(getLatestUserPrompt([
    { role: 'user', content: 'First' },
    { role: 'user', content: '  Latest question  ' }
  ]), 'Latest question')
})
