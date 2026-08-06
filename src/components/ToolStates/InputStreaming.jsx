import React from 'react'

export default function InputStreaming({ tool, message }) {
  return (
    <div className="tool-state streaming">
      <div className="tool-header">Preparing <strong>{tool}</strong></div>
      <div className="loader">
        <span />
        <span />
        <span />
      </div>
      <p className="muted">{message || 'Preparing the tool. Validating input…'}</p>
    </div>
  )
}
