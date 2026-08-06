Load testing tools and instructions

IMPORTANT: Only run load tests against servers you own or have explicit permission to test. Running load tests against third-party sites is illegal and unethical.

1) Quick autocannon runner (Node)

- Usage (default targets http://localhost:3000):

```bash
# Install dev dependencies first (if not installed):
npm install

# Run with defaults
npm run load:test

# Configure target and parameters via env vars
TARGET_URL=http://localhost:3000 AC_CONNECTIONS=100 AC_DURATION=30 npm run load:test
```

- The runner uses `autocannon` and prints throughput, latency, and errors.

2) k6 script (recommended for more advanced scenarios)

- Install k6: https://k6.io/docs/getting-started/installation
- Run the included script:

```bash
# Example: 50 virtual users for 60 seconds
K6_VUS=50 K6_DURATION=60s TARGET_URL=http://localhost:3000 k6 run tools/k6/script.js
```

3) Interpreting results

- Watch for error rates and timeouts. If error rate increases rapidly as load grows, the service is likely hitting capacity limits.
- Key metrics: requests/sec, latency (p50/p95/p99), errors, TCP connection issues.

4) Safety and best practices

- Test in a staging environment or on systems you own.
- Start small and ramp up gradually.
- Monitor the target server's CPU, memory, network, and error logs while testing.
- Never run destructive tests against production systems without approval.

5) Automating detection of downtime

- The repo includes `tools/run_autocannon.cjs` which exits non-zero on fatal errors. You can wrap it to detect when error rate or throughput drops.

Example wrapper (bash):

```bash
TARGET_URL=http://localhost:3000 AC_CONNECTIONS=100 AC_DURATION=30 node tools/run_autocannon.cjs | tee load.out
# then analyze load.out for results and errors
```

If you want, I can:
- Add a simple dashboard stub (Prometheus + Grafana) for visual monitoring in this repo.
- Add an automated script to progressively ramp load and detect the point where errors exceed a threshold.

