import http from 'node:http';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { program } from 'commander';

program
  .helpOption('--help', 'show usage information')
  .requiredOption('-h, --host <address>', 'address the server listens on')
  .requiredOption('-p, --port <number>', 'port the server listens on')
  .requiredOption('-c, --cache <path>', 'directory for cached images')
  .parse();

const { host, port, cache } = program.opts();

if (!/^\d+$/.test(port) || Number(port) > 65535) {
  program.error(`error: invalid port '${port}': expected an integer from 0 to 65535`);
}

const cacheDir = path.resolve(cache);

function sendText(res, status, message, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(`${message}\n`);
}

function parseStatusCode(req) {
  const { pathname } = new URL(req.url, 'http://localhost');
  const match = /^\/([1-5]\d\d)$/.exec(pathname);
  return match ? match[1] : null;
}

const server = http.createServer(async (req, res) => {
  const code = parseStatusCode(req);
  if (!code) {
    return sendText(res, 400, 'Bad Request: expected a path like /200');
  }
  sendText(res, 404, `Not Found: no image for ${code}`);
});

try {
  await mkdir(cacheDir, { recursive: true });
  server.listen(Number(port), host);
  await once(server, 'listening');
} catch (err) {
  console.error(`error: cannot start server: ${err.message}`);
  process.exit(1);
}

console.log(`Listening on http://${host}:${port}, cache: ${cacheDir}`);
