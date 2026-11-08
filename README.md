# http-cat-caching-proxy

A small caching HTTP proxy for [http.cat](https://http.cat) images, written in Node.js on top of the built-in `http` module.

The first request for an image is forwarded to http.cat, stored on disk and returned to the client. Later requests are served straight from the cache directory. Images can also be uploaded or removed by hand.

All asynchronous code uses promises and `async`/`await` only: `fs/promises` for files, `superagent` for outgoing requests. The only callback is the request handler passed to `http.createServer`.

## Requirements

- Node.js 22.12 or newer

## Setup

```bash
npm install
node main.js --host 127.0.0.1 --port 3000 --cache ./cache
```

| Option | Description |
| --- | --- |
| `-h, --host <address>` | address the server listens on |
| `-p, --port <number>` | port the server listens on |
| `-c, --cache <path>` | directory for cached images, created on startup if missing |

All three options are required. `--help` prints usage.

## API

The status code of the wanted image goes in the path: `/200`, `/404`, `/418`. Accepted codes are `100`-`599`.

| Method | Behaviour | Success |
| --- | --- | --- |
| `GET` | return the cached image, or fetch it from http.cat, cache it and return it | `200`, `Content-Type: image/jpeg` |
| `PUT` | store the request body as the image for the code, replacing an existing one | `201` |
| `DELETE` | remove the image from the cache | `200` |
| other | | `405` with an `Allow` header |

Every `GET` response carries an `X-Image-Source` header: `cache` or `http.cat`.

| Status | When |
| --- | --- |
| `400` | path is not `/<code>`, or the `PUT` body is empty |
| `404` | no such image on http.cat (or http.cat is unreachable), or `DELETE` of an image that is not cached |
| `413` | `PUT` body is larger than 10 MB |
| `500` | unexpected server error; the server keeps running |

```bash
curl -i http://127.0.0.1:3000/418                      # fetched from http.cat
curl -i http://127.0.0.1:3000/418                      # served from the cache
curl -i -X PUT --data-binary @samples/custom-image.jpg http://127.0.0.1:3000/418
curl -i -X DELETE http://127.0.0.1:3000/418
```

## Design notes

- Images are stored as `<code>.jpg`. The path is validated against `^/[1-5]\d\d$` before it touches the file system, so a request cannot leave the cache directory.
- Writes go to a temporary file that is renamed over the target, so a reader never sees a half-written image.
- Concurrent requests for an image that is not cached share one download from http.cat.
- A failed download is never cached.

## Testing

`test.txt` lists the curl commands used to check every method. `postman/` holds a Postman collection with automated tests; start from an empty cache directory:

```bash
npx newman run postman/http-cat-caching-proxy.postman_collection.json --working-dir .
```

The collection variable `baseUrl` holds the server address. The `PUT` request uploads `samples/custom-image.jpg`; in the Postman app set the working directory to the repository folder or pick the file again.
