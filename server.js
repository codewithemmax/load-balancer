const http = require('http');
const crypto = require('crypto');

const DEFAULT_PORT = 3000;
const DEFAULT_BACKENDS = [
  { host: 'localhost', port: 3001 },
  { host: 'localhost', port: 3002 },
  { host: 'localhost', port: 3003 }
];
const DEFAULT_HEALTH_CHECK_PATH = '/health';
const DEFAULT_HEALTH_CHECK_INTERVAL = 5000;
const DEFAULT_HEALTH_CHECK_TIMEOUT = 2000;

function createLoadBalancer({
  port = DEFAULT_PORT,
  backends = DEFAULT_BACKENDS,
  healthCheckPath = DEFAULT_HEALTH_CHECK_PATH,
  healthCheckInterval = DEFAULT_HEALTH_CHECK_INTERVAL,
  healthCheckTimeout = DEFAULT_HEALTH_CHECK_TIMEOUT
} = {}) {
  if (!Array.isArray(backends) || backends.length === 0) {
    throw new Error('At least one backend is required');
  }

  const backendStates = backends.map((backend) => ({
    ...backend,
    healthy: true,
    checking: false,
    activeRequests: 0
  }));
  function getHealthyBackends() {
    return backendStates.filter((backend) => backend.healthy);
  }

  function hashClientIp(clientIp) {
    const digest = crypto.createHash('sha256').update(clientIp).digest();
    return digest.readUInt32BE(0);
  }

  function selectBackend(clientIp) {
    const healthyBackends = getHealthyBackends();
    if (healthyBackends.length === 0) {
      return null;
    }

    return healthyBackends[hashClientIp(clientIp) % healthyBackends.length];
  }

  function checkBackend(backend) {
    if (backend.checking) {
      return;
    }

    backend.checking = true;
    const healthRequest = http.request(
      {
        hostname: backend.host,
        port: backend.port,
        path: healthCheckPath,
        method: 'GET'
      },
      (healthResponse) => {
        const isHealthy =
          healthResponse.statusCode >= 200 && healthResponse.statusCode < 300;
        backend.healthy = isHealthy;
        backend.checking = false;
        healthResponse.resume();
      }
    );

    healthRequest.setTimeout(healthCheckTimeout, () => {
      healthRequest.destroy();
    });

    healthRequest.on('error', () => {
      backend.healthy = false;
      backend.checking = false;
    });

    healthRequest.end();
  }

  function checkAllBackends() {
    backendStates.forEach(checkBackend);
  }

  const server = http.createServer((request, response) => {
    const clientIp = request.socket.remoteAddress || 'unknown';
    const backend = selectBackend(clientIp);
    if (!backend) {
      response.writeHead(503, { 'Content-Type': 'text/plain' });
      response.end('No healthy backends available');
      return;
    }

    backend.activeRequests += 1;
    let requestReleased = false;
    const releaseRequest = () => {
      if (requestReleased) {
        return;
      }
      requestReleased = true;
      backend.activeRequests -= 1;
    };

    response.once('finish', releaseRequest);
    response.once('close', releaseRequest);

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
      releaseRequest();
      backend.healthy = false;
      if (!response.headersSent) {
        response.writeHead(502, { 'Content-Type': 'text/plain' });
        response.end('Bad Gateway');
      } else {
        response.destroy();
      }
    });

    request.pipe(proxyRequest);
  });

  checkAllBackends();
  const healthCheckTimer = setInterval(checkAllBackends, healthCheckInterval);
  healthCheckTimer.unref();

  const close = (callback) => {
    clearInterval(healthCheckTimer);
    server.close(callback);
  };

  return {
    port,
    backends,
    server,
    close,
    getBackendStates: () =>
      backendStates.map(({ host, port, healthy, activeRequests }) => ({
        host,
        port,
        healthy,
        activeRequests
      })),
    getBackendForClientIp: (clientIp) => {
      const backend = selectBackend(clientIp);
      return backend ? { host: backend.host, port: backend.port } : null;
    }
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
  DEFAULT_HEALTH_CHECK_PATH,
  DEFAULT_HEALTH_CHECK_INTERVAL,
  DEFAULT_HEALTH_CHECK_TIMEOUT,
  createLoadBalancer
};