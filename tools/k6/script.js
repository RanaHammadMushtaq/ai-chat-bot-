import http from 'k6/http'
import { check } from 'k6'

export const options = {
  vus: __ENV.K6_VUS ? Number(__ENV.K6_VUS) : 20,
  duration: __ENV.K6_DURATION || '30s'
}

export default function () {
  const url = __ENV.TARGET_URL || 'http://localhost:3000'
  const res = http.get(url)
  check(res, { 'status is 200': (r) => r.status === 200 })
}
