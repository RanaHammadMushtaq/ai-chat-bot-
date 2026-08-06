const autocannon = require('autocannon')

const target = process.env.TARGET_URL || 'http://localhost:3000'
const connections = Number(process.env.AC_CONNECTIONS) || 50
const duration = Number(process.env.AC_DURATION) || 20 // seconds
const pipelining = Number(process.env.AC_PIPELINING) || 1

console.log(`Running load test against ${target} — connections=${connections}, duration=${duration}s, pipelining=${pipelining}`)

const instance = autocannon({ url: target, connections, duration, pipelining }, (err, res) => {
  if (err) {
    console.error('Autocannon error:', err)
    process.exit(1)
  }
  console.log('Results:', res)
})

autocannon.track(instance, { renderProgressBar: true })
