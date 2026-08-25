import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'
import { MODEL_CONFIG, SYSTEM_PROMPT } from '../../server/aiConfig.js'
import { buildGeminiHistory, buildOpenAIMessageHistory, getLatestUserPrompt } from '../../server/chatUtils.js'
import { SecurityScannerTool } from '../../server/tools/securityTool'
import { LoadTestTool } from '../../server/tools/loadTestTool'

export const config = { maxDuration: 60 }

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

const shouldCallSecurityTool = (prompt: string) => /scan|security|vuln|vulnerability|audit|analyze site|analyze website|score site/i.test(prompt)
const shouldCallLoadTest = (prompt: string) => /load test|stress test|benchmark|capacity test|loadtest|autocannon|requests per second|rps/i.test(prompt)

const writeEvent = (res: any, event: object) => {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

const getGeminiErrorMessage = (error: any) => {
  const message = error?.message || ''
  if (/429|quota|rate limit|resource exhausted/i.test(message)) return 'Gemini API quota has been exceeded. Please wait a bit or add billing/credits.'
  if (/401|403|api key|denied|forbidden/i.test(message)) return 'The Gemini API key is invalid or not authorized.'
  if (/404|not found/i.test(message)) return 'The selected Gemini model is unavailable. Please try another model.'
  return 'The model is temporarily unavailable. Please try again shortly.'
}

const streamGeminiResponse = async (messages: any[], res: any) => {
  if (!genAI) throw new Error('Gemini is not configured')
  const model = genAI.getGenerativeModel({
    model: MODEL_CONFIG.model,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: MODEL_CONFIG.generationConfig
  })
  const result = await model.generateContentStream({ contents: buildGeminiHistory(messages) })
  for await (const chunk of result.stream) {
    const delta = chunk.text()
    if (delta) writeEvent(res, { type: 'model.delta', delta })
  }
}

const streamOpenAIResponse = async (messages: any[], res: any) => {
  if (!openai) throw new Error('OpenAI is not configured')
  const stream = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    stream: true,
    temperature: MODEL_CONFIG.generationConfig.temperature,
    max_tokens: MODEL_CONFIG.generationConfig.maxOutputTokens,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...buildOpenAIMessageHistory(messages)]
  })
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) writeEvent(res, { type: 'model.delta', delta })
  }
}

const streamModelResponse = async (messages: any[], res: any) => {
  if (genAI) {
    try {
      await streamGeminiResponse(messages, res)
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!openai || !/429|quota|rate limit|resource exhausted/i.test(message)) throw error
    }
  }
  await streamOpenAIResponse(messages, res)
}

const runTool = async (tool: any, input: any, messages: any[], res: any) => {
  writeEvent(res, { type: 'tool.prepare', tool: tool.name, message: `Preparing ${tool.name}` })
  try {
    const validated = tool.parameters.parse(input)
    writeEvent(res, { type: 'tool.input', tool: tool.name, input: validated })
    const output = await tool.execute(validated)
    writeEvent(res, { type: 'tool.output', tool: tool.name, output })
    const lastUserIndex = [...messages].map((message) => message.role).lastIndexOf('user')
    const messagesWithToolResult = [...messages]
    const toolResult = `\n\nStructured ${tool.name} result:\n${JSON.stringify(output)}\n\nSummarize this result for the user.`
    if (lastUserIndex >= 0 && typeof messagesWithToolResult[lastUserIndex].content === 'string') {
      messagesWithToolResult[lastUserIndex] = {
        ...messagesWithToolResult[lastUserIndex],
        content: `${messagesWithToolResult[lastUserIndex].content}${toolResult}`
      }
    }
    await streamModelResponse(messagesWithToolResult, res)
  } catch (error: any) {
    const message = error?.errors
      ? error.errors.map((entry: any) => entry.message).join('; ')
      : error?.message || String(error)
    writeEvent(res, { type: 'tool.error', tool: tool.name, error: message })
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { messages = [] } = req.body || {}
  const safeMessages = Array.isArray(messages) ? messages : []
  const userPrompt = getLatestUserPrompt(safeMessages)
  if (!userPrompt) {
    res.status(400).json({ error: 'A user message is required.' })
    return
  }
  if (!genAI && !openai) {
    res.status(500).json({ error: 'No AI provider is configured. Add GEMINI_API_KEY or OPENAI_API_KEY in Vercel project settings.' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  try {
    const urlMatch = userPrompt.match(/https?:\/\/[\w\-._~:/.?#\[\]@!$&'()*+,;=%]+/i)
    const depthMatch = userPrompt.match(/depth=(\d+)/i)
    const connectionsMatch = userPrompt.match(/connections=(\d+)/i)
    const durationMatch = userPrompt.match(/duration=(\d+)/i)

    if (shouldCallSecurityTool(userPrompt)) {
      await runTool(SecurityScannerTool, {
        ...(urlMatch ? { url: urlMatch[0] } : {}),
        ...(depthMatch ? { depth: Number(depthMatch[1]) } : {})
      }, safeMessages, res)
    } else if (shouldCallLoadTest(userPrompt)) {
      await runTool(LoadTestTool, {
        ...(urlMatch ? { url: urlMatch[0] } : {}),
        ...(connectionsMatch ? { connections: Number(connectionsMatch[1]) } : {}),
        ...(durationMatch ? { duration: Number(durationMatch[1]) } : {})
      }, safeMessages, res)
    } else {
      await streamModelResponse(safeMessages, res)
    }
  } catch (error) {
    console.error(error)
    writeEvent(res, { type: 'model.error', error: getGeminiErrorMessage(error) })
  } finally {
    res.end()
  }
}
