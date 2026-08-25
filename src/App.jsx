"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import InputStreaming from './components/ToolStates/InputStreaming'
import InputAvailable from './components/ToolStates/InputAvailable'
import OutputAvailable from './components/ToolStates/OutputAvailable'
import LoadTestOutput from './components/ToolStates/LoadTestOutput'
import OutputError from './components/ToolStates/OutputError'

const initialMessages = [
  {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: 'Hello! I can help summarize your idea clearly and concisely. Share your concept below.'
  }
]

function App() {
  const [messages, setMessages] = useState(initialMessages)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [isStopRequested, setIsStopRequested] = useState(false)
  const [error, setError] = useState('')
  const [toolState, setToolState] = useState(null)
  const messagesEndRef = useRef(null)
  const abortControllerRef = useRef(null)
  const isPinnedToBottomRef = useRef(true)

  useEffect(() => {
    if (isPinnedToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isStreaming])

  const handleScroll = () => {
    const container = messagesEndRef.current?.parentElement
    if (!container) return
    const isNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 24
    isPinnedToBottomRef.current = isNearBottom
  }

  const stopStream = () => {
    abortControllerRef.current?.abort()
    setIsStopRequested(true)
    setIsStreaming(false)
  }

  const sendMessage = async (event) => {
    event?.preventDefault()
    if (!input.trim() || isStreaming) return

    const userMessage = { id: crypto.randomUUID(), role: 'user', content: input.trim() }
    const assistantMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', isPartial: true }

    setMessages((current) => [...current, userMessage, assistantMessage])
    setInput('')
    setError('')
    setIsStreaming(true)
    setIsStopRequested(false)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMessage] }),
        signal: controller.signal
      })

      if (!response.ok || !response.body) {
        const errorPayload = await response.json().catch(() => null)
        throw new Error(errorPayload?.error || 'Unable to start stream')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let streamedText = ''
      let receivedEvent = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          const payload = part.slice(6)
          if (!payload) continue
          const parsed = JSON.parse(payload)
          receivedEvent = true

          // Model streaming deltas
          if (parsed.type === 'model.delta' && parsed.delta) {
            streamedText += parsed.delta
            setMessages((current) => {
              const updated = [...current]
              const target = updated[updated.length - 1]
              if (target?.role === 'assistant') {
                target.content = streamedText
                target.isPartial = true
                target.isError = false
              }
              return updated
            })
          }

          // Tool lifecycle events
          if (parsed.type === 'tool.prepare') {
            setToolState({ stage: 'streaming', tool: parsed.tool, message: parsed.message })
          }

          if (parsed.type === 'tool.input') {
            setToolState({ stage: 'input', tool: parsed.tool, input: parsed.input })
          }

          if (parsed.type === 'tool.output') {
            setToolState({ stage: 'output', tool: parsed.tool, output: parsed.output })
          }

          if (parsed.type === 'tool.error') {
            setToolState({ stage: 'error', tool: parsed.tool, error: parsed.error })
          }

          if (parsed.type === 'model.error') {
            setError(parsed.error)
            setMessages((current) => {
              const updated = [...current]
              const target = updated[updated.length - 1]
              if (target?.role === 'assistant') {
                target.content = parsed.error
                target.isPartial = false
                target.isError = true
              }
              return updated
            })
          }
        }
      }

      if (!receivedEvent) {
        throw new Error('The server returned an empty response. Check the Netlify function logs and GEMINI_API_KEY.')
      }

      setMessages((current) => {
        const updated = [...current]
        const target = updated[updated.length - 1]
        if (target?.role === 'assistant') {
          target.isPartial = false
        }
        return updated
      })
      setIsStreaming(false)
      setIsStopRequested(false)
    } catch (error) {
      if (error.name === 'AbortError') {
        setMessages((current) => {
          const updated = [...current]
          const target = updated[updated.length - 1]
          if (target?.role === 'assistant') {
            target.isPartial = false
          }
          return updated
        })
      } else {
        setError(error.message || 'The stream stopped unexpectedly. Please try again.')
      }
      setIsStreaming(false)
      setIsStopRequested(false)
    }
  }

  const helperPills = useMemo(() => ['Summarize the idea', 'Rewrite this idea', 'Explain the tradeoffs'], [])

  return (
    <div className="app-shell">
      <div className="chat-card">
        <header className="chat-header">
          <div className="brand-block">
            <p className="eyebrow">Rana's AI</p>
            <h1>AI workspace</h1>
          </div>
          <div className="status-pill">{isStreaming ? 'Responding…' : 'Ready'}</div>
        </header>

        <div className="message-list" onScroll={handleScroll}>
          {/* Tool UI slot */}
          {toolState ? (
            <div style={{ marginBottom: 12 }}>
              {toolState.stage === 'streaming' && <InputStreaming tool={toolState.tool} message={toolState.message} />}
              {toolState.stage === 'input' && <InputAvailable tool={toolState.tool} input={toolState.input} />}
              {toolState.stage === 'output' && (toolState.tool === 'loadTester' ? (
                <LoadTestOutput tool={toolState.tool} output={toolState.output} />
              ) : (
                <OutputAvailable tool={toolState.tool} output={toolState.output} />
              ))}
              {toolState.stage === 'error' && <OutputError tool={toolState.tool} error={toolState.error} onRetry={() => { setToolState(null); }} />}
            </div>
          ) : null}
          {messages.map((message) => (
            <div key={message.id} className={`message-row ${message.role}`}>
              <div className={`message-bubble ${message.role} ${message.isError ? 'is-error' : ''}`}>
                <span className="message-author">{message.role === 'assistant' ? "Rana's AI" : 'You'}</span>
                {message.role === 'assistant' && message.isPartial && !message.content ? (
                  <span className="thinking-indicator">Thinking<span /></span>
                ) : (
                  <p className={message.isError ? 'error-text' : ''}>{message.content}</p>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="quick-actions">
          {helperPills.map((pill) => (
            <button key={pill} type="button" onClick={() => setInput(pill)}>
              {pill}
            </button>
          ))}
        </div>

        {error ? <p className="error-text" role="alert">{error}</p> : null}

        <form className="composer" onSubmit={sendMessage}>
          <textarea
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Summarize the idea or describe it here..."
            maxLength={4000}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                sendMessage(event)
              }
            }}
          />
          <div className="composer-actions">
            <span className="character-count">{input.length}/4000</span>
            {isStreaming ? (
              <button type="button" className="secondary" onClick={stopStream}>
                Stop
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()}>Send</button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default App
