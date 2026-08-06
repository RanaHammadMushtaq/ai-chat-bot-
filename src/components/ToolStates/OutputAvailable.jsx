import React from 'react'
import ScoreCard from '../ui/ScoreCard'
import FindingsTable from '../ui/FindingsTable'

export default function OutputAvailable({ tool, output }) {
  return (
    <div className="tool-state output-available card">
      <div className="tool-header">Results from <strong>{tool}</strong></div>
      <div className="result-grid">
        <ScoreCard score={output.score} url={output.url} scannedAt={output.metadata?.scannedAt} />
        <FindingsTable findings={output.findings} />
      </div>
    </div>
  )
}
