import http from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
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
const ALLOWED_METHODS = ['GET', 'PUT', 'DELETE'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

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
  try {
    const response = await superagent
      .get(`https://http.cat/${code}`)
      .responseType('blob')
      .timeout({ response: 5000, deadline: 15000 });
    if (!Buffer.isBuffer(response.body) || response.type !== 'image/jpeg') {
      throw new Error(`unexpected response type '${response.type}'`);
    }
    return response.body;
  } catch (err) {
    const reason = err.status ? `http.cat replied with ${err.status}` : err.message;
    throw new HttpError(404, `Not Found: no image for ${code} (${reason})`);
  }
}

const pendingDownloads = new Map();

async function downloadImage(code) {
  try {
    const image = await fetchFromHttpCat(code);
    await saveToCache(code, image);
    return image;
  } finally {
    pendingDownloads.delete(code);
  }
}

function loadFromHttpCat(code) {
  let download = pendingDownloads.get(code);
  if (!download) {
    download = downloadImage(code);
    pendingDownloads.set(code, download);
  }
  return download;
}

async function getImage(res, code) {
  try {
    const image = await readFile(cacheFile(code));
    return sendImage(res, image, 'cache');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const image = await loadFromHttpCat(code);
  sendImage(res, image, 'http.cat');
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_IMAGE_SIZE) {
      throw new HttpError(413, `Payload Too Large: limit is ${MAX_IMAGE_SIZE} bytes`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function putImage(req, res, code) {
  const image = await readBody(req);
  if (image.length === 0) {
    return sendText(res, 400, 'Bad Request: request body is empty');
  }
  await saveToCache(code, image);
  sendText(res, 201, `Created: image for ${code} saved`);
}

async function deleteImage(res, code) {
  try {
    await unlink(cacheFile(code));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return sendText(res, 404, `Not Found: image for ${code} is not cached`);
  }
  sendText(res, 200, `OK: image for ${code} deleted`);
}

const server = http.createServer(async (req, res) => {
  try {
    if (!ALLOWED_METHODS.includes(req.method)) {
      return sendText(res, 405, `Method Not Allowed: ${req.method}`, { Allow: ALLOWED_METHODS.join(', ') });
    }
    const code = parseStatusCode(req);
    if (!code) {
      return sendText(res, 400, 'Bad Request: expected a path like /200');
    }
    switch (req.method) {
      case 'GET':
        return await getImage(res, code);
      case 'PUT':
        return await putImage(req, res, code);
      case 'DELETE':
        return await deleteImage(res, code);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      return sendText(res, err.status, err.message, { Connection: 'close' });
    }
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
