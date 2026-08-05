import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'
import { MODEL_CONFIG, SYSTEM_PROMPT } from '../../server/aiConfig.js'
import { buildGeminiHistory, buildOpenAIMessageHistory, getLatestUserPrompt } from '../../server/chatUtils.js'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { messages = [] } = req.body || {}
  const userPrompt = getLatestUserPrompt(messages)

  if (!userPrompt) {
    res.status(400).json({ error: 'A user message is required.' })
    return
  }

  if (!process.env.GEMINI_API_KEY) {
    res.status(500).json({ error: 'The model is unavailable right now. Please try again shortly.' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

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
    res.write(`data: ${JSON.stringify({ error: getGeminiErrorMessage(error) })}\n\n`)
    res.end()
  }
}
