const http = require('http');

const DEFAULT_PORT = 3000;
const DEFAULT_BACKENDS = [
  { host: 'localhost', port: 3001 },
  { host: 'localhost', port: 3002 },
  { host: 'localhost', port: 3003 }
];

function createLoadBalancer({
  port = DEFAULT_PORT,
  backends = DEFAULT_BACKENDS
} = {}) {
  if (!Array.isArray(backends) || backends.length === 0) {
    throw new Error('At least one backend is required');
  }

  let nextBackend = 0;

  const server = http.createServer((request, response) => {
    const backend = backends[nextBackend];
    nextBackend = (nextBackend + 1) % backends.length;

    const proxyRequest = http.request(
      {
        hostname: backend.host,
        port: backend.port,
        path: request.url,
        method: request.method,
        headers: request.headers
      },
      (proxyResponse) => {
        response.writeHead(proxyResponse.statusCode, proxyResponse.headers);
        proxyResponse.pipe(response);
      }
    );

    proxyRequest.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(502, { 'Content-Type': 'text/plain' });
      }
      response.end('Bad Gateway');
    });

    request.pipe(proxyRequest);
  });

  return {
    port,
    backends,
    server
  };
}

if (require.main === module) {
  const loadBalancer = createLoadBalancer();

  loadBalancer.server.listen(loadBalancer.port, () => {
    console.log(
      `Load balancer listening on port ${loadBalancer.port}; ` +
        `backends: ${loadBalancer.backends.map(({ host, port }) => `${host}:${port}`).join(', ')}`
    );
  });
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_BACKENDS,
  createLoadBalancer
};