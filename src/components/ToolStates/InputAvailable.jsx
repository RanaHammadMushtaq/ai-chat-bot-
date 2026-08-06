import React from 'react'

export default function InputAvailable({ tool, input }) {
  return (
    <div className="tool-state input-available card">
      <div className="tool-header">Validated Input for <strong>{tool}</strong></div>
      <div className="input-card">
        <dl>
          {Object.entries(input).map(([k, v]) => (
            <div key={k} className="field-row">
              <dt>{k}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
