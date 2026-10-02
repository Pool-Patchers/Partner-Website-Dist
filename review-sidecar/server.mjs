#!/usr/bin/env node
/**
 * Staging review-tool sidecar (runs as a container in the partner stack). Serves the two endpoints the
 * tool needs: GET/PUT /api/review.json and GET /api/whoami. front-nginx proxies /api/* here on each
 * staging.<domain> host; ONE sidecar serves all partners by keying its comment store per-host.
 *
 * Reachability: only via front-nginx on the internal compose network, which is only reachable through
 * the Cloudflare Tunnel (no inbound ports on the droplet). Cloudflare Access gates staging.<domain> at
 * the edge and injects Cf-Access-Authenticated-User-Email; the plaintext-header gate below is safe
 * because the tunnel is the SOLE path here. TODO (Security's belt-and-suspenders note): also verify the
 * Cf-Access-Jwt-Assertion JWT against the Access app's /cdn-cgi/access/certs once the Access app's
 * team-domain + AUD exist — adds auth we control, independent of the network path.
 *
 * Env: HOST (default 0.0.0.0), PORT (default 4321), REVIEW_STORE_DIR (default /var/lib/review-tool).
 */
import { createServer } from 'node:http';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 4321);
const STORE_DIR = process.env.REVIEW_STORE_DIR || '/var/lib/review-tool';

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
// Per-host store file, filename sanitized from the request Host (so one sidecar serves all partners).
function storePath(host) {
  const safe = String(host || 'unknown').toLowerCase().replace(/[^a-z0-9.-]/g, '_').slice(0, 120);
  return join(STORE_DIR, `${safe}.json`);
}
async function readComments(host) {
  try {
    const parsed = JSON.parse(await readFile(storePath(host), 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}
async function writeComments(host, comments) {
  await mkdir(STORE_DIR, { recursive: true });
  const p = storePath(host);
  const tmp = `${p}.tmp`;
  await writeFile(tmp, JSON.stringify(comments), 'utf8');
  await rename(tmp, p);
}
function nameFromEmail(email) {
  const local = (email.split('@')[0] || email).split('+')[0] || email;
  const name = local.split(/[._-]+/).filter(Boolean)
    .map((t) => t[0].toUpperCase() + t.slice(1).toLowerCase()).join(' ');
  return name || email;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const host = req.headers.host;
    const email = req.headers['cf-access-authenticated-user-email'];

    if (url.pathname === '/api/whoami' && req.method === 'GET') {
      return send(res, 200, email ? { email, name: nameFromEmail(String(email)) } : { email: null, name: null });
    }
    if (url.pathname === '/api/review.json') {
      if (!email) return send(res, 401, { ok: false, error: 'Unauthorized — Cloudflare Access session required.' });
      if (req.method === 'GET') return send(res, 200, await readComments(host));
      if (req.method === 'PUT') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        let body;
        try { body = JSON.parse(raw); } catch { return send(res, 400, { ok: false, error: 'Request body must be valid JSON.' }); }
        if (!Array.isArray(body)) return send(res, 400, { ok: false, error: 'Request body must be a JSON array.' });
        await writeComments(host, body);
        return send(res, 200, { ok: true });
      }
    }
    send(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    console.error('[review-sidecar]', err);
    send(res, 500, { ok: false, error: String(err?.message ?? err) });
  }
});
server.listen(PORT, HOST, () => console.log(`review sidecar on ${HOST}:${PORT} store=${STORE_DIR}`));
