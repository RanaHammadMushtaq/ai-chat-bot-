import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'
import { MODEL_CONFIG, SYSTEM_PROMPT } from '../../server/aiConfig.js'
import { buildGeminiHistory, buildOpenAIMessageHistory, getLatestUserPrompt } from '../../server/chatUtils.js'
import { SecurityScannerTool } from '../../server/tools/securityTool'
import { LoadTestTool } from '../../server/tools/loadTestTool'

const geminiApiKey = process.env.GEMINI_API_KEY || ''
const genAI = new GoogleGenerativeAI(geminiApiKey)
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

const getGeminiErrorMessage = (error: any) => {
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

const isGeminiQuotaError = (error: any) => /429|quota|rate limit|resource exhausted/i.test(error?.message || '')

const streamOpenAIResponse = async (messages: any[], res: any) => {
  const stream = await openai!.chat.completions.create({
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
      res.write(`data: ${JSON.stringify({ type: 'model.delta', delta })}\n\n`)
    }
  }
}

// Simple heuristic tool selectors
const shouldCallSecurityTool = (prompt: string) => /scan|security|vuln|vulnerability|audit|analyze site|analyze website|score site/i.test(prompt)
const shouldCallLoadTest = (prompt: string) => /load test|stress test|benchmark|capacity test|loadtest|autocannon|requests per second|rps/i.test(prompt)

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { messages = [] } = req.body || {}
  const userPrompt = getLatestUserPrompt(messages)

  console.log('User prompt:', userPrompt)
  console.log('shouldCallSecurityTool:', shouldCallSecurityTool(userPrompt))
  console.log('shouldCallLoadTest:', shouldCallLoadTest(userPrompt))

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
    // Decide whether to call a tool
      if (shouldCallSecurityTool(userPrompt)) {
      // Signal input streaming (preparing tool)
      res.write(`data: ${JSON.stringify({ type: 'tool.prepare', tool: SecurityScannerTool.name, message: 'Preparing security scanner' })}\n\n`)

      // Extract a URL and optional depth from the user prompt
      const urlMatch = userPrompt.match(/https?:\/\/[\w\-._~:\/?#\[\]@!$&'()*+,;=%]+/i)
      const depthMatch = userPrompt.match(/depth=(\d+)/i)

      const inferredInput: any = {}
      if (urlMatch) inferredInput.url = urlMatch[0]
      if (depthMatch) inferredInput.depth = Number(depthMatch[1])

      // Validate parameters
      try {
        const validated = SecurityScannerTool.parameters.parse(inferredInput)
        res.write(`data: ${JSON.stringify({ type: 'tool.input', tool: SecurityScannerTool.name, input: validated })}\n\n`)

        // Execute tool and stream lifecycle
        try {
          const output = await SecurityScannerTool.execute(validated)
          res.write(`data: ${JSON.stringify({ type: 'tool.output', tool: SecurityScannerTool.name, output })}\n\n`)

          // Add tool output into the model history so the assistant can continue the conversation with the structured result.
          const enrichedMessages = [...messages, { role: 'tool', name: SecurityScannerTool.name, content: JSON.stringify(output) }]

          // Now stream model response using Gemini
          const history = buildGeminiHistory(enrichedMessages)
          const model = genAI.getGenerativeModel({
            model: MODEL_CONFIG.model,
            systemInstruction: SYSTEM_PROMPT,
            generationConfig: MODEL_CONFIG.generationConfig
          })
          const result = await model.generateContentStream({ contents: history })

          for await (const chunk of result.stream) {
            const delta = chunk.text()
            if (delta) {
              res.write(`data: ${JSON.stringify({ type: 'model.delta', delta })}\n\n`)
            }

              // Load test tool
              if (shouldCallLoadTest(userPrompt)) {
                console.log('Invoking load test tool block')
                try {
                  res.write(`data: ${JSON.stringify({ type: 'tool.prepare', tool: LoadTestTool.name, message: 'Preparing load tester' })}\n\n`)
                  console.log('Wrote tool.prepare SSE')
                } catch (sseErr) {
                  console.error('Failed to write SSE prepare:', sseErr)
                }

                const urlMatch = userPrompt.match(/https?:\/\/[\w\-._~:\/?#\[\]@!$&'()*+,;=%]+/i)
                const connMatch = userPrompt.match(/connections=(\d+)/i)
                const durMatch = userPrompt.match(/duration=(\d+)/i)

                const inferred: any = {}
                if (urlMatch) inferred.url = urlMatch[0]
                if (connMatch) inferred.connections = Number(connMatch[1])
                if (durMatch) inferred.duration = Number(durMatch[1])

                try {
                  const validated = LoadTestTool.parameters.parse(inferred)
                  res.write(`data: ${JSON.stringify({ type: 'tool.input', tool: LoadTestTool.name, input: validated })}\n\n`)

                  try {
                    const output = await LoadTestTool.execute(validated)
                    res.write(`data: ${JSON.stringify({ type: 'tool.output', tool: LoadTestTool.name, output })}\n\n`)

                    const enrichedMessages = [...messages, { role: 'tool', name: LoadTestTool.name, content: JSON.stringify(output) }]

                    const history = buildGeminiHistory(enrichedMessages)
                    const model = genAI.getGenerativeModel({
                      model: MODEL_CONFIG.model,
                      systemInstruction: SYSTEM_PROMPT,
                      generationConfig: MODEL_CONFIG.generationConfig
                    })
                    const result = await model.generateContentStream({ contents: history })

                    for await (const chunk of result.stream) {
                      const delta = chunk.text()
                      if (delta) {
                        res.write(`data: ${JSON.stringify({ type: 'model.delta', delta })}\n\n`)
                      }
                    }

                    res.end()
                    return
                  } catch (execError: any) {
                    console.error('Load test execution failed', execError)
                    const errorMessage = execError?.message || String(execError)
                    res.write(`data: ${JSON.stringify({ type: 'tool.error', tool: LoadTestTool.name, error: errorMessage })}\n\n`)
                  }
                } catch (validationError: any) {
                  const message = validationError?.errors ? validationError.errors.map((e: any) => e.message).join('; ') : validationError.message
                  res.write(`data: ${JSON.stringify({ type: 'tool.error', tool: LoadTestTool.name, error: `Invalid tool input: ${message}` })}\n\n`)
                }
              }
          }

          res.end()
          return
        } catch (execError: any) {
          console.error('Tool execution failed', execError)
          const errorMessage = execError?.message || String(execError)
          res.write(`data: ${JSON.stringify({ type: 'tool.error', tool: SecurityScannerTool.name, error: errorMessage })}\n\n`)
        }
      } catch (validationError: any) {
        const message = validationError?.errors ? validationError.errors.map((e: any) => e.message).join('; ') : validationError.message
        res.write(`data: ${JSON.stringify({ type: 'tool.error', tool: SecurityScannerTool.name, error: `Invalid tool input: ${message}` })}\n\n`)
      }
    }

    // If no tool was called, proceed with normal model streaming
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
        res.write(`data: ${JSON.stringify({ type: 'model.delta', delta })}\n\n`)
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
    res.write(`data: ${JSON.stringify({ type: 'model.error', error: getGeminiErrorMessage(error) })}\n\n`)
    res.end()
  }
}
