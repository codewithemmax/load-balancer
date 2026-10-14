# Node Load Balancer

A small HTTP reverse proxy written with Node.js. The project is being built
incrementally to demonstrate common load-balancing strategies.

## Current version: v3.0 — Least Connections

Version 3.0 builds on v2.0 by routing each request to the healthy backend with
the fewest active requests.

When healthy backends have the same number of active requests, a round-robin
tie-breaker distributes requests between them:

```text
Backend A -> Backend B -> Backend C -> Backend A
```

The implementation tracks an active-request count for every backend:

```text
backend = healthy backend with the smallest activeRequests
```

The reverse proxy accepts a client request, selects the least-connected
healthy backend, increments its counter, forwards the request, and decrements
the counter when the response finishes or the client connection closes.

### Default configuration

| Setting | Default |
| --- | --- |
| Load balancer port | `3000` |
| Backend 1 | `localhost:3001` |
| Backend 2 | `localhost:3002` |
| Backend 3 | `localhost:3003` |
| Health endpoint | `GET /health` |
| Health-check interval | `5 seconds` |
| Health-check timeout | `2 seconds` |

Backends that fail a health check are temporarily removed from rotation.
Healthy backends continue receiving traffic, and failed backends are
automatically added back after a later health check succeeds. If a request
fails before the next health check, that backend is removed immediately.

If multiple healthy backends have the same lowest active-request count, the
tie-breaker rotates through those backends. This preserves predictable
distribution for short requests while allowing long-running requests to
influence later routing decisions.

If no backend is healthy, the load balancer returns `503 Service Unavailable`.
If a selected backend fails while handling a request, the load balancer returns
`502 Bad Gateway`.

## Requirements

- Node.js 18 or later

No runtime dependencies are required. The proxy uses Node.js's built-in
`http` module.

## Running the load balancer

From the project directory:

```powershell
node .\server.js
```

The server reports the listening port and configured backends when it starts.

## Testing locally

Start one simple backend in each of three terminals:

```powershell
node -e "require('http').createServer((req,res)=>res.end('response from backend 3001')).listen(3001)"
```

```powershell
node -e "require('http').createServer((req,res)=>res.end('response from backend 3002')).listen(3002)"
```

```powershell
node -e "require('http').createServer((req,res)=>res.end('response from backend 3003')).listen(3003)"
```

In another terminal, start the load balancer:

```powershell
node .\server.js
```

Then send several requests through port `3000`:

```powershell
curl.exe http://localhost:3000/
curl.exe http://localhost:3000/
curl.exe http://localhost:3000/
curl.exe http://localhost:3000/
```

For short requests, responses should be distributed across the backends. To
observe least-connections behavior, make one backend deliberately slow:

```powershell
node -e "require('http').createServer((req,res)=>setTimeout(()=>res.end('slow backend 3001'),3000)).listen(3001)"
```

Send concurrent requests while that backend is still processing. New
requests should prefer the healthy backends with fewer active requests instead
of blindly following a fixed sequence.

To verify failover, stop one backend with `Ctrl+C`. Wait for the next health
check, then send requests through port `3000`. Requests should continue to be
served by the remaining healthy backends. Restart the stopped backend and
confirm that it returns to rotation after a successful `/health` check.

To verify the all-backends-down behavior, stop all three backends, wait for a
health-check cycle, and run:

```powershell
curl.exe -i http://localhost:3000/
```

The response should have status `503 Service Unavailable`.

## Analytics and observability plan

The current v3.0 implementation does not collect analytics yet. The best
approach is to add observability in stages, without mixing it into the routing
algorithm:

1. **Structured request logs**
   - Request method and path
   - Selected backend
   - Response status
   - Request duration in milliseconds
   - Error category, when applicable
   - A request or correlation ID

2. **Aggregated metrics**
   - Total requests
   - Requests per backend
   - Successful responses and `5xx` responses
   - `502` responses caused by unavailable backends
   - Average and percentile latency, especially p95 and p99
   - Active requests

3. **Time-series storage and dashboards**
   - Export metrics in a standard format such as Prometheus
   - Keep high-cardinality values such as full URLs out of metric labels
   - Build a dashboard showing traffic distribution, error rate, and latency
     by backend

For this project, the recommended first analytics milestone is structured
JSON request logging followed by counters and latency histograms. This keeps
the learning loop simple while making it possible to compare routing behavior
as v2.0, v3.0, and v4.0 are introduced. Logs should not include cookies,
authorization headers, request bodies, or other sensitive data.

## Roadmap

### v1.0: Round Robin (complete)

- Distribute requests sequentially: A → B → C → A.
- Learn basic state management with one current-index integer.
- Use modulo arithmetic to loop back to the first backend.
- Validate that the reverse proxy can pipe requests and responses.

### v2.0: Active Health Checks and Failover (complete)

- Periodically request a health endpoint such as `GET /health`.
- Temporarily remove failed backends from the routing pool.
- Restore backends after they become healthy again.
- Learn asynchronous background tasks, failure detection, and dynamic pool
  updates.

This version is implemented. Health checks run every five seconds by default,
with a two-second timeout.

### v3.0: Least Connections (current)

- Route each request to the backend with the fewest active requests.
- Increment a backend's connection count when a request starts.
- Decrement it when the response completes or the client socket closes.
- Compare the behavior with round robin when requests have different
  processing times.

This version is implemented. It retains v2.0 health checks and failover while
using active-request counts for routing.

### v4.0: IP Hashing and Sticky Sessions

- Read the client's IP address.
- Hash the address to select a consistent backend.
- Keep a client on the same backend for session-oriented applications.
- Learn hashing and Layer 4/Layer 7 request data.

## Project status

v3.0 is currently in scope. Version 4.0 documents the intended
learning path and are not promises that those features are already available.
