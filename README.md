# Node Load Balancer

A small HTTP reverse proxy written with Node.js. The project is being built
incrementally to demonstrate common load-balancing strategies.

## Current version: v4.0 — IP Hashing and Sticky Sessions

Version 4.0 builds on v2.0 and v3.0 by hashing each client's IP address to
select a backend. Requests from the same client are routed to the same healthy
backend while that backend remains available.

The client IP is hashed with SHA-256 and mapped to the current healthy backend
list:

```text
backendIndex = sha256(clientIp) % healthyBackends.length
```

This version still tracks active requests for observability, but active-request
counts no longer determine routing. The reverse proxy forwards all requests
from a client to its hashed backend.

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

Backends that fail a health check are temporarily removed from the hash pool.
Healthy backends continue receiving traffic, and failed backends are
automatically added back after a later health check succeeds. If a request
fails before the next health check, that backend is removed immediately.

If the hashed backend is unhealthy, the client is temporarily mapped to a
healthy backend from the remaining pool. When the original backend recovers,
the client may be mapped back to it. Adding or removing a backend can change
the mapping for some clients because this implementation uses a simple modulo
hash; a production implementation would use consistent hashing to minimize
remapping.

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

Requests from the same client should consistently return from the same backend.
To make the selected backend visible, give each backend a distinct response:

```powershell
node -e "require('http').createServer((req,res)=>{if(req.url==='/health')return res.end('ok');res.end('response from backend 3001')}).listen(3001)"
```

Repeat the same request several times. The response should keep identifying the
same backend. Requests from a different client IP will be hashed independently.

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

The current v4.0 implementation does not collect analytics yet. The best
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
as each version is introduced. Logs should not include cookies,
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

### v3.0: Least Connections (complete)

- Route each request to the backend with the fewest active requests.
- Increment a backend's connection count when a request starts.
- Decrement it when the response completes or the client socket closes.
- Compare the behavior with round robin when requests have different
  processing times.

This version is implemented. It retains v2.0 health checks and failover while
using active-request counts for routing.

### v4.0: IP Hashing and Sticky Sessions (current)

- Read the client's IP address.
- Hash the address to select a consistent backend.
- Keep a client on the same backend for session-oriented applications.
- Learn hashing and Layer 4/Layer 7 request data.

This version is implemented. It uses the request socket's source IP and does
not trust a client-supplied `X-Forwarded-For` header.

## Project status

v4.0 is currently in scope. All planned versions through v4.0 are implemented.
