import http from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { program } from 'commander';
import superagent from 'superagent';

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

const cacheFile = (code) => path.join(cacheDir, `${code}.jpg`);

function sendImage(res, image, source) {
  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Content-Length': image.length,
    'X-Image-Source': source,
  });
  res.end(image);
}

async function saveToCache(code, image) {
  const tmpFile = `${cacheFile(code)}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmpFile, image);
    await rename(tmpFile, cacheFile(code));
  } catch (err) {
    await rm(tmpFile, { force: true });
    throw err;
  }
}

async function fetchFromHttpCat(code) {
  const response = await superagent
    .get(`https://http.cat/${code}`)
    .responseType('blob')
    .timeout({ response: 5000, deadline: 15000 });
  if (!Buffer.isBuffer(response.body) || response.type !== 'image/jpeg') {
    throw new Error(`unexpected response type '${response.type}'`);
  }
  return response.body;
}

async function getImage(res, code) {
  try {
    const image = await readFile(cacheFile(code));
    return sendImage(res, image, 'cache');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  let image;
  try {
    image = await fetchFromHttpCat(code);
  } catch (err) {
    const reason = err.status ? `http.cat replied with ${err.status}` : err.message;
    return sendText(res, 404, `Not Found: no image for ${code} (${reason})`);
  }
  await saveToCache(code, image);
  sendImage(res, image, 'http.cat');
}

const server = http.createServer(async (req, res) => {
  try {
    const code = parseStatusCode(req);
    if (!code) {
      return sendText(res, 400, 'Bad Request: expected a path like /200');
    }
    switch (req.method) {
      case 'GET':
        return await getImage(res, code);
      default:
        return sendText(res, 501, 'Not Implemented');
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendText(res, 500, 'Internal Server Error');
    else res.destroy();
  }
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
