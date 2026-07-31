import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { GoogleGenAI } from '@google/genai'
import { SYSTEM_PROMPT, MODEL_CONFIG } from './server/aiConfig.js'
import { buildGeminiMessages, getLatestUserPrompt } from './server/chatUtils.js'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

const sendErrorEvent = (res, message) => {
  res.write(`data: ${JSON.stringify({ error: message })}\n\n`)
  res.end()
}

const getErrorMessage = (error) => {
  const message = error?.message || error?.error?.message || 'The model is temporarily unavailable because the provider rejected the request.'
  if (message.includes('quota') || message.includes('RESOURCE_EXHAUSTED') || message.includes('429')) {
    return 'Gemini quota is exhausted for this account right now. Please wait a bit or use a different key/account.'
  }
  return message
}

app.post('/api/chat', async (req, res) => {
  const { messages = [] } = req.body || {}
  const userPrompt = getLatestUserPrompt(messages)

  if (!userPrompt) {
    res.status(400).json({ error: 'A user message is required.' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  if (!process.env.GEMINI_API_KEY) {
    sendErrorEvent(res, 'The model is unavailable right now. Please try again shortly.')
    return
  }

  try {
    const geminiMessages = buildGeminiMessages(messages)

    const response = await genai.models.generateContentStream({
      model: MODEL_CONFIG.model,
      contents: [
        { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
        ...geminiMessages
      ],
      config: {
        temperature: MODEL_CONFIG.temperature,
        maxOutputTokens: MODEL_CONFIG.max_tokens
      }
    })

    for await (const chunk of response) {
      const text = chunk.text
      if (text) {
        res.write(`data: ${JSON.stringify({ delta: text })}\n\n`)
      }
    }

    res.end()
  } catch (error) {
    console.error(error)
    sendErrorEvent(res, getErrorMessage(error))
  }
})

app.listen(3001, () => {
  console.log('Streaming chat server running on http://localhost:3001')
})
