import React from 'react'

export default function FindingsTable({ findings }) {
  if (!findings || findings.length === 0) return <div className="no-findings">No findings detected</div>
  return (
    <table className="findings-table">
      <thead>
        <tr>
          <th>Severity</th>
          <th>Title</th>
          <th>Location</th>
        </tr>
      </thead>
      <tbody>
        {findings.map((f) => (
          <tr key={f.id} className={`sev-${f.severity}`}>
            <td>
              <strong style={{ textTransform: 'capitalize' }}>{f.severity}</strong>
            </td>
            <td>
              <div className="title">{f.title}</div>
              <div className="desc muted">{f.description}</div>
              {f.evidence && f.evidence.length > 0 ? (
                <details>
                  <summary className="muted">Evidence ({f.evidence.length})</summary>
                  <ul>
                    {f.evidence.map((e, idx) => (
                      <li key={idx}><pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{e}</pre></li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {f.recommendation ? <div className="muted" style={{ marginTop: 6 }}><strong>Fix:</strong> {f.recommendation}</div> : null}
            </td>
            <td>{f.location || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
