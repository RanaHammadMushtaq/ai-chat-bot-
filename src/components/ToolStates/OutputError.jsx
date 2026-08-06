import React from 'react'

export default function OutputError({ tool, error, onRetry }) {
  return (
    <div className="tool-state output-error card">
      <div className="tool-header">{tool} failed</div>
      <p className="error-text">{error}</p>
      <div className="actions">
        <button onClick={onRetry}>Retry</button>
      </div>
    </div>
  )
}
