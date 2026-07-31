import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'
import { SYSTEM_PROMPT, MODEL_CONFIG } from './server/aiConfig.js'
import { buildGeminiHistory, buildOpenAIMessageHistory, getLatestUserPrompt } from './server/chatUtils.js'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null

const sendErrorEvent = (res, message) => {
  if (res.writableEnded || res.destroyed) {
    return
  }

  try {
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`)
    res.end()
  } catch (error) {
    console.error('Failed to send SSE error event:', error)
  }
}

const getGeminiErrorMessage = (error) => {
  const message = error?.message || ''

  if (/429|quota|rate limit|resource exhausted/i.test(message)) {
    return 'Gemini API quota has been exceeded for this account. Please wait a bit or add billing/credits in Google AI Studio, then try again.'
  }

  if (/401|403|api key|denied|forbidden/i.test(message)) {
    return 'The Gemini API key is invalid or not authorized for this request.'
  }

  if (/404|not found/i.test(message)) {
    return 'The selected Gemini model is unavailable for this account. Please try another model.'
  }

  return 'The model is temporarily unavailable because the provider rejected the request. Please try again shortly.'
}

const isGeminiQuotaError = (error) => /429|quota|rate limit|resource exhausted/i.test(error?.message || '')

const streamOpenAIResponse = async (messages, res) => {
  const stream = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    stream: true,
    temperature: MODEL_CONFIG.generationConfig.temperature,
    max_tokens: MODEL_CONFIG.generationConfig.maxOutputTokens,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...buildOpenAIMessageHistory(messages)
    ]
  })

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) {
      res.write(`data: ${JSON.stringify({ delta })}\n\n`)
    }
  }
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
    const history = buildGeminiHistory(messages)
    const model = genAI.getGenerativeModel({
      model: MODEL_CONFIG.model,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: MODEL_CONFIG.generationConfig
    })
    const result = await model.generateContentStream({ contents: history })

    for await (const chunk of result.stream) {
      const delta = chunk.text()
      if (delta) {
        res.write(`data: ${JSON.stringify({ delta })}\n\n`)
      }
    }

    res.end()
  } catch (error) {
    console.error(error)
    if (openai && isGeminiQuotaError(error)) {
      try {
        await streamOpenAIResponse(messages, res)
        res.end()
        return
      } catch (fallbackError) {
        console.error('OpenAI fallback failed:', fallbackError)
      }
    }
    sendErrorEvent(res, getGeminiErrorMessage(error))
  }
})

const PORT = process.env.PORT || 3001

app.listen(PORT, () => {
  console.log(`Streaming chat server running on http://localhost:${PORT}`)
})
