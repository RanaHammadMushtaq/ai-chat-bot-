import { z } from 'zod'

export const SecurityScanParams = z.object({
  url: z.string().url().describe('The URL to scan'),
  depth: z.number().int().min(1).max(5).optional().default(1).describe('Scan depth, 1-5')
})

export type SecurityScanParamsType = z.infer<typeof SecurityScanParams>

export const FindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  title: z.string(),
  description: z.string(),
  why: z.string().optional(),
  evidence: z.array(z.string()).optional(),
  recommendation: z.string().optional(),
  location: z.string().optional()
})
export type Finding = z.infer<typeof FindingSchema>

export const SecurityScanResult = z.object({
  url: z.string().url(),
  score: z.number().min(0).max(100),
  findings: z.array(FindingSchema),
  metadata: z.object({ scannedAt: z.string().optional(), checkedAt: z.string().optional() })
})
export type SecurityScanResultType = z.infer<typeof SecurityScanResult>

/**
 * Security Scanner Tool
 * - description: lightweight server-side site scanner that returns structured findings
 * - parameters: `SecurityScanParams`
 * - execute(): asynchronously returns `SecurityScanResult`
 */
export const SecurityScannerTool = {
  name: 'securityScanner',
  description: 'Performs a server-side security assessment of a target URL. Returns evidence-backed findings and a calculated score.',
  parameters: SecurityScanParams,
  resultSchema: SecurityScanResult,
  async execute(params: SecurityScanParamsType): Promise<SecurityScanResultType> {
    const validated = SecurityScanParams.parse(params)

    const findings: Finding[] = []

    const urlObj = new URL(validated.url)
    const isHttps = urlObj.protocol === 'https:'

    // helper: fetch with timeout
    const fetchWithTimeout = async (input: string, opts: any = {}, timeout = 10000) => {
      const controller = new AbortController()
      const id = setTimeout(() => controller.abort(), timeout)
      try {
        const res = await fetch(input, { ...opts, signal: controller.signal })
        clearTimeout(id)
        return res
      } catch (e) {
        clearTimeout(id)
        throw e
      }
    }

    // 1) Check HTTPS availability and certificate
    if (!isHttps) {
      findings.push({
        id: 'https-availability',
        severity: 'high',
        title: 'Missing HTTPS',
        description: 'Target is served over HTTP rather than HTTPS.',
        why: 'Without HTTPS, traffic can be intercepted or modified by attackers.',
        evidence: [`URL uses ${urlObj.protocol}`],
        recommendation: 'Enable HTTPS and redirect all HTTP traffic to HTTPS.',
        location: validated.url
      })
    } else {
      // TLS certificate inspection
      try {
        const tls = await import('tls')
        const port = urlObj.port ? Number(urlObj.port) : 443
        const certInfo = await new Promise((resolve, reject) => {
          const socket = tls.connect({ host: urlObj.hostname, port, servername: urlObj.hostname, rejectUnauthorized: false }, () => {
            try {
              // @ts-ignore
              const peer = socket.getPeerCertificate(true)
              socket.end()
              resolve(peer)
            } catch (err) {
              socket.end()
              reject(err)
            }
          })
          socket.on('error', (e) => reject(e))
        })

        // @ts-ignore
        const cert: any = certInfo
        if (cert && cert.valid_to) {
          const expiry = new Date(cert.valid_to)
          if (expiry < new Date()) {
            findings.push({
              id: 'tls-expired',
              severity: 'critical',
              title: 'Expired TLS/SSL certificate',
              description: `The certificate expired on ${expiry.toISOString()}.`,
              why: 'Expired certificates prevent secure connections and can be exploited by attackers to intercept traffic.',
              evidence: [`valid_to: ${cert.valid_to}`, `subject: ${JSON.stringify(cert.subject)}`],
              recommendation: 'Renew the TLS certificate immediately with a trusted CA.',
              location: validated.url
            })
          }
        }
      } catch (err) {
        findings.push({
          id: 'tls-error',
          severity: 'high',
          title: 'TLS/SSL certificate check failed',
          description: `Could not retrieve TLS certificate: ${String(err)}`,
          why: 'Unable to verify certificate configuration.',
          evidence: [String(err)],
          recommendation: 'Ensure the server presents a valid TLS certificate and that port 443 is reachable.',
          location: validated.url
        })
      }
    }

    // 2) Fetch home page to inspect headers and body
    let res: any = null
    let bodyText = ''
    try {
      res = await fetchWithTimeout(validated.url, { redirect: 'follow' }, 12000)
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('text') || ct.includes('html')) {
        try {
          bodyText = await res.text()
        } catch (e) {
          bodyText = ''
        }
      }
    } catch (err) {
      findings.push({
        id: 'fetch-failed',
        severity: 'high',
        title: 'Failed to fetch target URL',
        description: `Could not fetch ${validated.url}: ${String(err)}`,
        why: 'If the site cannot be reached, other automated checks cannot complete.',
        evidence: [String(err)],
        recommendation: 'Verify the URL is correct and the server is reachable from this scanner.',
        location: validated.url
      })
    }

    // 3) Headers checks
    if (res) {
      const hdr = (name: string) => res.headers.get(name) || null
      const csp = hdr('content-security-policy')
      const hsts = hdr('strict-transport-security')
      const xfo = hdr('x-frame-options')
      const xcto = hdr('x-content-type-options')
      const ref = hdr('referrer-policy')
      const perms = hdr('permissions-policy')
      const serverHeader = hdr('server')

      if (!csp) {
        findings.push({
          id: 'missing-csp',
          severity: 'medium',
          title: 'Missing Content-Security-Policy header',
          description: 'CSP header is not present.',
          why: 'CSP helps prevent XSS by restricting allowed script sources.',
          evidence: ['content-security-policy: <missing>'],
          recommendation: 'Add a restrictive Content-Security-Policy header.',
          location: validated.url
        })
      }

      if (!hsts) {
        findings.push({
          id: 'missing-hsts',
          severity: 'medium',
          title: 'Missing Strict-Transport-Security header',
          description: 'HSTS header is not present.',
          why: 'HSTS ensures browsers only connect over HTTPS to prevent downgrade attacks.',
          evidence: ['strict-transport-security: <missing>'],
          recommendation: 'Add a Strict-Transport-Security header with an appropriate max-age.',
          location: validated.url
        })
      }

      if (!xfo && !csp?.includes('frame-ancestors')) {
        findings.push({
          id: 'missing-clickjacking',
          severity: 'medium',
          title: 'Missing clickjacking protections',
          description: 'No X-Frame-Options header and no frame-ancestors in CSP.',
          why: 'Without these, pages may be embedded in an attacker-controlled frame.',
          evidence: ['x-frame-options: <missing>', `csp frame-ancestors: ${csp ? 'not set' : '<missing>'}`],
          recommendation: 'Set X-Frame-Options or a CSP frame-ancestors directive.',
          location: validated.url
        })
      }

      if (!xcto) {
        findings.push({
          id: 'missing-xcto',
          severity: 'low',
          title: 'Missing X-Content-Type-Options header',
          description: 'X-Content-Type-Options header is not present.',
          why: 'This header helps prevent MIME-type sniffing vulnerabilities.',
          evidence: ['x-content-type-options: <missing>'],
          recommendation: 'Add header: X-Content-Type-Options: nosniff',
          location: validated.url
        })
      }

      if (!ref) {
        findings.push({
          id: 'missing-referrer',
          severity: 'low',
          title: 'Missing Referrer-Policy header',
          description: 'Referrer-Policy header is not present.',
          why: 'Controls what referrer information is sent to external sites.',
          evidence: ['referrer-policy: <missing>'],
          recommendation: 'Add a sensible Referrer-Policy, e.g., no-referrer-when-downgrade or strict-origin-when-cross-origin.',
          location: validated.url
        })
      }

      if (!perms) {
        findings.push({
          id: 'missing-permissions',
          severity: 'info',
          title: 'Missing Permissions-Policy header',
          description: 'Permissions-Policy header is not present.',
          why: 'Controls access to powerful browser features.',
          evidence: ['permissions-policy: <missing>'],
          recommendation: 'Set a restrictive Permissions-Policy to opt-out of unneeded features.',
          location: validated.url
        })
      }

      if (serverHeader) {
        findings.push({
          id: 'exposed-server',
          severity: 'info',
          title: 'Exposed Server Header',
          description: `Server header exposes server information: ${serverHeader}`,
          why: 'Exposing server/version information can help attackers fingerprint the stack.',
          evidence: [`server: ${serverHeader}`],
          recommendation: 'Remove or minimize the Server header disclosure.',
          location: validated.url
        })
      }

      // Cookies
      const setCookie = res.headers.raw ? res.headers.raw()['set-cookie'] : []
      if (setCookie && setCookie.length > 0) {
        for (let i = 0; i < setCookie.length; i++) {
          const c = setCookie[i]
          const flags = []
          if (/;\s*Secure/i.test(c)) flags.push('Secure')
          if (/;\s*HttpOnly/i.test(c)) flags.push('HttpOnly')
          if (/;\s*SameSite=/i.test(c)) flags.push('SameSite')
          if (flags.length === 0) {
            findings.push({
              id: `cookie-flags-${i}`,
              severity: 'high',
              title: 'Cookie missing Secure/HttpOnly/SameSite flags',
              description: `A Set-Cookie header is missing security flags: ${c}`,
              why: 'Cookies without these flags are at higher risk of theft or misuse.',
              evidence: [c],
              recommendation: 'Set Secure, HttpOnly and an appropriate SameSite attribute on session cookies.',
              location: validated.url
            })
          }
        }
      }

      // CORS
      const acao = hdr('access-control-allow-origin')
      if (acao) {
        if (acao === '*' ) {
          findings.push({
            id: 'cors-wildcard',
            severity: 'high',
            title: 'CORS wildcard in Access-Control-Allow-Origin',
            description: 'Access-Control-Allow-Origin is set to * which allows any origin.',
            why: 'This can expose sensitive endpoints to cross-origin requests from arbitrary sites.',
            evidence: [`access-control-allow-origin: ${acao}`],
            recommendation: 'Restrict Access-Control-Allow-Origin to trusted origins and avoid using * for authenticated endpoints.',
            location: validated.url
          })
        }
      }
    }

    // 4) Common files and directory listing checks
    const commonPaths = ['/robots.txt', '/security.txt', '/sitemap.xml']
    for (const p of commonPaths) {
      try {
        const full = new URL(p, validated.url).toString()
        const r = await fetchWithTimeout(full, { method: 'GET' }, 8000)
        if (r && r.status === 200) {
          const snippet = await r.text().then(t => t.slice(0, 200))
          findings.push({
            id: `found-${p.replace(/\W/g,'')}`,
            severity: 'info',
            title: `${p} found`,
            description: `${p} is present and accessible.`,
            why: 'Exposed metadata may reveal sensitive endpoints or contact information.',
            evidence: [snippet],
            recommendation: `Review ${p} contents and avoid exposing sensitive information.`,
            location: full
          })
        }
      } catch (e) {
        // ignore fetch errors for auxiliary files
      }
    }

    // 5) Directory listing detection
    try {
      const listUrl = new URL('/', validated.url).toString()
      const r = await fetchWithTimeout(listUrl, { method: 'GET' }, 8000)
      if (r && r.status === 200) {
        const body = await r.text().then(t => t.slice(0, 2000))
        if (/Index of \/|Directory listing for \//i.test(body)) {
          findings.push({
            id: 'directory-listing',
            severity: 'high',
            title: 'Directory listing enabled',
            description: 'Server returns a directory listing for a path.',
            why: 'Directory listings can expose sensitive files.',
            evidence: [body.slice(0, 500)],
            recommendation: 'Disable directory listings on the server (e.g., disable autoindex).',
            location: listUrl
          })
        }
      }
    } catch (e) {
      // ignore
    }

    // 6) Mixed content detection (only for HTTPS pages)
    if (isHttps && bodyText) {
      const mixed = Array.from(bodyText.matchAll(/https?:\/\/(?![^\"]*https?)/gi)).filter(m => m[0].startsWith('http://'))
      if (mixed.length > 0) {
        findings.push({
          id: 'mixed-content',
          severity: 'high',
          title: 'Mixed content detected',
          description: 'Page loads insecure HTTP resources while served over HTTPS.',
          why: 'Mixed content allows attackers to tamper with insecure resources.',
          evidence: [bodyText.slice(0, 800)],
          recommendation: 'Serve all resources over HTTPS and update resource URLs.',
          location: validated.url
        })
      }
    }

    // 7) Redirect checks
    try {
      // simple redirect observation
      if (res && res.redirected) {
        findings.push({
          id: 'redirect-observed',
          severity: 'info',
          title: 'Redirects observed',
          description: `The request was redirected to ${res.url}`,
          why: 'Redirects may be expected; check chain integrity and ensure HTTPS redirects are used.',
          evidence: [`final_url: ${res.url}`],
          recommendation: 'Ensure redirects are intentional and use HTTPS.',
          location: `${validated.url} -> ${res.url}`
        })
      }
    } catch (e) {}

    // 8) Basic reflection test for XSS-like indicators
    try {
      const testParam = 'scanner_test_reflect_1234'
      const u = new URL(validated.url)
      u.searchParams.set('q', testParam)
      const r = await fetchWithTimeout(u.toString(), { method: 'GET' }, 8000)
      if (r && r.status === 200) {
        const text = await r.text().then(t => t.slice(0, 2000))
        if (text.includes(testParam)) {
          findings.push({
            id: 'reflected-input',
            severity: 'medium',
            title: 'Reflected input found in response',
            description: 'A user-supplied value appears reflected in the HTML response.',
            why: 'Reflected inputs can be an indicator of XSS risk if not properly escaped.',
            evidence: [`parameter: q=${testParam}`, `snippet: ${text.substring(Math.max(0, text.indexOf(testParam)-80), text.indexOf(testParam)+80)}`],
            recommendation: 'Ensure user input is properly escaped or sanitized before rendering.',
            location: u.toString()
          })
        }
      }
    } catch (e) {
      // ignore
    }

    // score calculation
    const base = 100
    const scorePenalty = findings.reduce((acc, f) => {
      if (f.severity === 'critical') return acc + 50
      if (f.severity === 'high') return acc + 25
      if (f.severity === 'medium') return acc + 10
      if (f.severity === 'low') return acc + 5
      return acc
    }, 0)
    const score = Math.max(0, base - scorePenalty)

    const result = {
      url: validated.url,
      score,
      findings,
      metadata: { scannedAt: new Date().toISOString(), checkedAt: new Date().toISOString() }
    }

    return SecurityScanResult.parse(result)
  }
}
