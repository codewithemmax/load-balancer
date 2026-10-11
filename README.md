# Node Load Balancer

A small HTTP reverse proxy written with Node.js. The project is being built
incrementally to demonstrate common load-balancing strategies.

## Current version: v1.0 — Round Robin

Version 1.0 is the working baseline.

Requests are distributed sequentially across the configured backends:

```text
Backend A -> Backend B -> Backend C -> Backend A
```

The implementation stores one index and advances it with the modulo operator:

```text
nextIndex = (nextIndex + 1) % backends.length
```

This version proves that the reverse proxy can accept a client request, select
a backend, forward the request, and pipe the backend response back to the
client.

### Default configuration

| Setting | Default |
| --- | --- |
| Load balancer port | `3000` |
| Backend 1 | `localhost:3001` |
| Backend 2 | `localhost:3002` |
| Backend 3 | `localhost:3003` |

If a backend cannot be reached, the load balancer returns `502 Bad Gateway`.

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

The responses should rotate through backends 3001, 3002, 3003, and then 3001
again. This verifies the round-robin behavior.

To verify the failure response, stop one backend with `Ctrl+C` and continue
sending requests. When the stopped backend is selected, the proxy should
return `502 Bad Gateway`.

## Analytics and observability plan

The current v1.0 implementation does not collect analytics yet. The best
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

### v1.0: Round Robin (current)

- Distribute requests sequentially: A → B → C → A.
- Learn basic state management with one current-index integer.
- Use modulo arithmetic to loop back to the first backend.
- Validate that the reverse proxy can pipe requests and responses.

### v2.0: Active Health Checks and Failover

- Periodically request a health endpoint such as `GET /health`.
- Temporarily remove failed backends from the routing pool.
- Restore backends after they become healthy again.
- Learn asynchronous background tasks, failure detection, and dynamic pool
  updates.

This version is planned but is intentionally not implemented yet.

### v3.0: Least Connections

- Route each request to the backend with the fewest active requests.
- Increment a backend's connection count when a request starts.
- Decrement it when the response completes or the client socket closes.
- Compare the behavior with round robin when requests have different
  processing times.

### v4.0: IP Hashing and Sticky Sessions

- Read the client's IP address.
- Hash the address to select a consistent backend.
- Keep a client on the same backend for session-oriented applications.
- Learn hashing and Layer 4/Layer 7 request data.

## Project status

Only v1.0 is currently in scope. The later versions document the intended
learning path and are not promises that those features are already available.
