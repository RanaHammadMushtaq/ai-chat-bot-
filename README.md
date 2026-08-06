# AI Chat Bot

This project is a streaming chat demo with server-side AI support.

## AI Tools

### securityScanner
- Tool Name: securityScanner
- Description: Scans a target URL for common issues and returns a structured list of findings with severity, evidence, recommendations, and a numeric score (0-100).
- Parameters (Zod schema):

```ts
const SecurityScanParams = z.object({
  url: z.string().url(),
  depth: z.number().int().min(1).max(5).optional().default(1)
})
```

- Return Shape (Zod):

```ts
const SecurityScanResult = z.object({
  url: z.string().url(),
  score: z.number().min(0).max(100),
  findings: z.array(z.object({ id: z.string(), severity: z.enum(['critical','high','medium','low','info']), title: z.string(), description: z.string(), why: z.string().optional(), evidence: z.array(z.string()).optional(), recommendation: z.string().optional(), location: z.string().optional() })),
  metadata: z.object({ scannedAt: z.string().optional(), checkedAt: z.string().optional() })
})
```

- Example Input:

```json
{ "url": "https://example.com", "depth": 1 }
```

- Example Output:

```json
{
  "url": "https://example.com",
  "score": 78,
  "findings": [
    { "id": "f1", "severity": "high", "title": "Unencrypted Transport", "description": "Site is using HTTP.", "why": "Traffic can be intercepted.", "evidence": ["URL uses http://example.com"], "recommendation": "Enable HTTPS and redirect HTTP to HTTPS.", "location": "/" }
  ],
  "metadata": { "scannedAt": "2026-08-06T12:00:00.000Z", "checkedAt": "2026-08-06T12:00:05.000Z" }
}
```

Notes:
- The tool is implemented using Zod and is strongly typed in `server/tools/securityTool.ts`.
- The AI route (`pages/api/chat.ts`) will automatically decide to call this tool when the user prompt contains trigger words like `scan`, `security`, `vuln`, `audit`, or `analyze site`.
- Tool lifecycle events are streamed via SSE with the following message types: `tool.prepare`, `tool.input`, `tool.output`, `tool.error`, and `model.delta`.

### loadTester
- Tool Name: loadTester
- Description: Runs a short, controlled load test against an allowed target (defaults to localhost). Returns structured metrics (requests/sec, latency percentiles, errors, status codes) and logs.
- Parameters (Zod schema):

```ts
const LoadTestParams = z.object({
  url: z.string().url(),
  connections: z.number().int().min(1).max(2000).optional().default(10),
  duration: z.number().int().min(1).max(3600).optional().default(20)
})
```

- Return Shape (Zod):

```ts
const LoadTestResult = z.object({
  url: z.string().url(),
  connections: z.number().int(),
  duration: z.number().int(),
  requests: z.object({ average: z.number(), total: z.number() }),
  latency: z.object({ p50: z.number(), p95: z.number(), p99: z.number() }),
  errors: z.number(),
  timeouts: z.number(),
  statusCodes: z.record(z.number()),
  metadata: z.object({ startedAt: z.string(), finishedAt: z.string() }),
  logs: z.array(z.string()).optional()
})
```

- Example Input:

```json
{ "url": "http://localhost:3000", "connections": 50, "duration": 30 }
```

- Example Output:

```json
{
  "url": "http://localhost:3000",
  "connections": 50,
  "duration": 30,
  "requests": { "average": 120.5, "total": 3615 },
  "latency": { "p50": 45, "p95": 220, "p99": 480 },
  "errors": 0,
  "timeouts": 0,
  "statusCodes": { "200": 3615 },
  "metadata": { "startedAt": "...", "finishedAt": "..." }
}
```

Notes:
- For safety, the tool only allows testing `localhost` by default. Set `ALLOWED_LOAD_TEST_HOSTS` (comma-separated) in the environment to add trusted hostnames.
- The tool uses `autocannon` programmatically. Install dev dependencies and ensure `autocannon` is available in the runtime environment.

