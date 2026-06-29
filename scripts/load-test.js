const targetUrl = process.env.TARGET_URL || 'http://localhost:3000/api/cards-scanned'
const rps = Number(process.env.RPS || 15)
const durationSeconds = Number(process.env.DURATION_SECONDS || 10)
const method = process.env.METHOD || 'GET'
const body = process.env.BODY || ''

if (!Number.isFinite(rps) || rps <= 0) {
  throw new Error('RPS must be a positive number')
}

if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
  throw new Error('DURATION_SECONDS must be a positive number')
}

const intervalMs = 1000 / rps
const totalRequests = Math.floor(rps * durationSeconds)
const results = []
let launched = 0

const sendRequest = async (id) => {
  const startedAt = performance.now()

  try {
    const res = await fetch(targetUrl, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body || undefined,
    })

    results.push({
      id,
      ok: res.ok,
      status: res.status,
      latencyMs: Math.round(performance.now() - startedAt),
    })
  } catch (error) {
    results.push({
      id,
      ok: false,
      status: 'ERROR',
      latencyMs: Math.round(performance.now() - startedAt),
      error: error.message,
    })
  }
}

console.log(`Load test starting`)
console.log(`Target: ${targetUrl}`)
console.log(`Rate: ${rps} requests/second`)
console.log(`Duration: ${durationSeconds}s`)
console.log(`Total requests: ${totalRequests}`)

await new Promise((resolve) => {
  const timer = setInterval(() => {
    launched += 1
    sendRequest(launched)

    if (launched >= totalRequests) {
      clearInterval(timer)
      resolve()
    }
  }, intervalMs)
})

while (results.length < totalRequests) {
  await new Promise(resolve => setTimeout(resolve, 50))
}

const statusCounts = results.reduce((acc, result) => {
  acc[result.status] = (acc[result.status] || 0) + 1
  return acc
}, {})

const latencies = results.map(result => result.latencyMs).sort((a, b) => a - b)
const percentile = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))]
const failures = results.filter(result => !result.ok)

console.log('\nLoad test complete')
console.log(`Sent: ${results.length}`)
console.log(`OK: ${results.length - failures.length}`)
console.log(`Failed: ${failures.length}`)
console.log(`Status counts: ${JSON.stringify(statusCounts)}`)
console.log(`Latency p50: ${percentile(0.50)}ms`)
console.log(`Latency p95: ${percentile(0.95)}ms`)
console.log(`Latency max: ${latencies[latencies.length - 1]}ms`)

if (failures.length > 0) {
  console.log('\nFirst failures:')
  console.log(failures.slice(0, 5))
  process.exitCode = 1
}
