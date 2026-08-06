import React from 'react'

export default function ScoreCard({ score, url, scannedAt }) {
  const color = score > 75 ? 'green' : score > 45 ? 'orange' : 'red'
  return (
    <div className={`score-card ${color}`}>
      <div className="score-value">{score}</div>
      <div className="score-meta">
        <div className="url">{url}</div>
        <div className="scanned">{scannedAt ? new Date(scannedAt).toLocaleString() : '—'}</div>
      </div>
    </div>
  )
}
