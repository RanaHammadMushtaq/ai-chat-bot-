const http = require('http')

const data = JSON.stringify({ messages: [{ role: 'user', content: 'Please run a load test http://localhost:3000 connections=10 duration=5' }] })

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}

const req = http.request(options, (res) => {
  res.setEncoding('utf8')
  console.log('Status:', res.statusCode)
  res.on('data', (chunk) => {
    process.stdout.write(chunk)
  })
  res.on('end', () => {
    console.log('\n\n[stream ended]')
  })
})

req.on('error', (e) => {
  console.error('Request error:', e.message)
})

req.write(data)
req.end()
