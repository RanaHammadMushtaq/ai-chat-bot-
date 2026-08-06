import { z } from 'zod'

export const LoadTestParams = z.object({
  url: z.string().url().describe('Target URL to load-test (must be allowed)'),
  connections: z.number().int().min(1).max(2000).optional().default(10).describe('Concurrent connections'),
  duration: z.number().int().min(1).max(3600).optional().default(20).describe('Duration in seconds')
})

export type LoadTestParamsType = z.infer<typeof LoadTestParams>

export const LoadTestResultSchema = z.object({
  url: z.string().url(),
  connections: z.number().int(),
  duration: z.number().int(),
  requests: z.object({
    average: z.number(),
    total: z.number()
  }),
  latency: z.object({ p50: z.number(), p95: z.number(), p99: z.number() }),
  errors: z.number(),
  timeouts: z.number(),
  statusCodes: z.record(z.number()),
  metadata: z.object({ startedAt: z.string(), finishedAt: z.string() }),
  logs: z.array(z.string()).optional()
})

export type LoadTestResultType = z.infer<typeof LoadTestResultSchema>

/**
 * Load Test Tool
 * - description: Runs a controlled load test against a target URL.
 * - parameters: `LoadTestParams` (URL, connections, duration)
 * - execute(): runs autocannon programmatically and returns structured metrics
 *
 * SECURITY: By default only allows testing localhost. Use environment var
 * `ALLOWED_LOAD_TEST_HOSTS` (comma-separated) to permit additional hostnames.
 */
export const LoadTestTool = {
  name: 'loadTester',
  description: 'Performs a short, controlled load test against a permitted target URL and returns structured metrics.',
  parameters: LoadTestParams,
  resultSchema: LoadTestResultSchema,
  async execute(params: LoadTestParamsType): Promise<LoadTestResultType> {
    const validated = LoadTestParams.parse(params)

    const target = new URL(validated.url)
    const allowedEnv = (process.env.ALLOWED_LOAD_TEST_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean)
    const allowedHosts = ['localhost', '127.0.0.1', '::1', ...allowedEnv]

    if (!allowedHosts.includes(target.hostname)) {
      throw new Error(`Target host not allowed for load testing: ${target.hostname}. Update ALLOWED_LOAD_TEST_HOSTS or use localhost.`)
    }

    // run autocannon programmatically
    let autocannon
    try {
      // require as CJS to avoid bundler issues
      // @ts-ignore
      autocannon = require('autocannon')
    } catch (e) {
      throw new Error('autocannon is not available. Install dev dependency or enable runner.')
    }

    const startedAt = new Date()

    return await new Promise((resolve, reject) => {
      const logs: string[] = []
      const inst = autocannon({ url: validated.url, connections: validated.connections, duration: validated.duration }, (err: any, result: any) => {
        if (err) return reject(err)

        const out = {
          url: validated.url,
          connections: validated.connections,
          duration: validated.duration,
          requests: { average: result.requests.mean || 0, total: result.requests.total || 0 },
          latency: { p50: result.latency.p50 || 0, p95: result.latency.p95 || 0, p99: result.latency.p99 || 0 },
          errors: result.errors || 0,
          timeouts: result.timeouts || 0,
          statusCodes: result.statusCodes || {},
          metadata: { startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString() },
          logs
        }

        try {
          resolve(LoadTestResultSchema.parse(out))
        } catch (e) {
          reject(e)
        }
      })

      // capture some progress lines as evidence
      autocannon.track(inst, { renderProgressBar: false, outputStream: { write: (s: any) => { logs.push(String(s).slice(0, 1000)) } } })
    })
  }
}
