import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import OpenAI from 'openai'
import { SYSTEM_PROMPT, MODEL_CONFIG } from './server/aiConfig.js'
import { buildOpenAIMessageHistory, getLatestUserPrompt } from './server/chatUtils.js'

dotenv.config()

const app = express()
app.use(cors())
app.use(express.json())

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const sendErrorEvent = (res, message) => {
  res.write(`data: ${JSON.stringify({ error: message })}\n\n`)
  res.end()
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

  if (!process.env.OPENAI_API_KEY) {
    sendErrorEvent(res, 'The model is unavailable right now. Please try again shortly.')
    return
  }

  try {
    const openAIHistory = buildOpenAIMessageHistory(messages)

    const stream = await openai.chat.completions.create({
      ...MODEL_CONFIG,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...openAIHistory],
      stream: true
    })

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) {
        res.write(`data: ${JSON.stringify({ delta })}\n\n`)
      }
    }

    res.end()
  } catch (error) {
    console.error(error)
    sendErrorEvent(res, 'The model is temporarily unavailable because the provider rejected the request. Please try again shortly.')
  }
})

app.listen(3001, () => {
  console.log('Streaming chat server running on http://localhost:3001')
})
