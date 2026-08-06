import React from 'react'

export default function LoadTestOutput({ tool, output }) {
  return (
    <div className="tool-state output-available card">
      <div className="tool-header">Load Test Results: <strong>{tool}</strong></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="input-card">
          <dl>
            <div className="field-row"><dt>URL</dt><dd>{output.url}</dd></div>
            <div className="field-row"><dt>Connections</dt><dd>{output.connections}</dd></div>
            <div className="field-row"><dt>Duration</dt><dd>{output.duration}s</dd></div>
            <div className="field-row"><dt>Started</dt><dd>{output.metadata?.startedAt}</dd></div>
            <div className="field-row"><dt>Finished</dt><dd>{output.metadata?.finishedAt}</dd></div>
          </dl>
        </div>

        <div>
          <div style={{ marginBottom: 8 }}><strong>Requests</strong>: {Math.round(output.requests.average)} req/s (total {output.requests.total})</div>
          <div style={{ marginBottom: 8 }}><strong>Latency</strong>: p50 {output.latency.p50} ms | p95 {output.latency.p95} ms | p99 {output.latency.p99} ms</div>
          <div style={{ marginBottom: 8 }}><strong>Errors</strong>: {output.errors} | <strong>Timeouts</strong>: {output.timeouts}</div>
          <div style={{ marginTop: 8 }}>
            <strong>Status codes</strong>
            <ul>
              {Object.entries(output.statusCodes || {}).map(([code, count]) => (
                <li key={code}>{code}: {count}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      {output.logs && output.logs.length > 0 ? (
        <details style={{ marginTop: 12 }}>
          <summary>Raw logs</summary>
          <pre style={{ maxHeight: 240, overflow: 'auto' }}>{output.logs.join('\n')}</pre>
        </details>
      ) : null}
    </div>
  )
}
