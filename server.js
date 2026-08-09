// Node.js server for hosting on platforms that run a real process listening
// on a port (CranL/Railpack). Reuses the same /api logic as functions/api —
// only the request/response transport and the env source (process.env) differ.
import express from 'express';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { onRequest } from './functions/api/[[route]].js';
import { recordRequest, recordException, getStats, getLogs } from './lib/monitoring.js';
import { setupWebSocket, broadcastToAll, getConnectionCount } from './lib/ws.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public', 'khaldiya');

function devAuthorized(req) {
  const key = req.get('X-Dev-Key') || req.query.key || '';
  return !!process.env.DEV_KEY && key === process.env.DEV_KEY;
}

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://api.sendpulse.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self';",
};

// SPA-style rewrites to index.html for client-side routes.
// '/admin' is intentionally excluded — it's a real static directory
// (public/khaldiya/admin/, the React admin dashboard), not an SPA route, and
// must fall through to express.static below instead of being rewritten here.
const SPA_REWRITES = ['/capabilities', '/history', '/chat', '/login', '/quiz', '/about', '/faq', '/support'];

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function nodeHeadersToFetchHeaders(nodeHeaders) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(nodeHeaders)) {
    if (v == null) continue;
    headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
  }
  return headers;
}

const app = express();
app.disable('x-powered-by');
// CranL terminates TLS at a proxy and forwards plain HTTP; without this,
// req.protocol is always 'http', so the constructed Request URL's origin
// mismatches the browser's "https://..." Origin header and every request
// gets rejected by the same-origin check in functions/api/[[route]].js.
app.set('trust proxy', true);

app.use((req, res, next) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  next();
});

// Access/error logging + metrics for /dev/monitoring — records every request's
// method, path, status, duration and IP into an in-memory rolling window.
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    recordRequest({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip || 'unknown',
    });
  });
  next();
});

// ── Developer monitoring APIs (protected by X-Dev-Key / ?key=) ────────────
// Registered before the generic '/api' catch-all below, since that handler
// responds to every /api/* request itself and would otherwise shadow these.
app.get('/api/dev/monitoring/stats', (req, res) => {
  if (!devAuthorized(req)) return res.status(403).json({ error: 'غير مسموح' });
  res.json(getStats());
});

app.get('/api/dev/monitoring/logs', (req, res) => {
  if (!devAuthorized(req)) return res.status(403).json({ error: 'غير مسموح' });
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json({ logs: getLogs(limit) });
});

// Experimental: broadcasts a test event to every connected WS client, to
// verify the hosting platform keeps long-lived WebSocket connections alive
// in production before any real feature depends on it.
app.post('/api/dev/monitoring/ws-test', express.json(), (req, res) => {
  if (!devAuthorized(req)) return res.status(403).json({ error: 'غير مسموح' });
  const delivered = broadcastToAll({ type: 'test', message: req.body?.message || 'ping', time: new Date().toISOString() });
  res.json({ delivered, connections: getConnectionCount() });
});

app.use('/api', async (req, res) => {
  try {
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const headers = nodeHeadersToFetchHeaders(req.headers);
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readRawBody(req);
    const request = new Request(url, { method: req.method, headers, body });
    const response = await onRequest({ request, env: process.env });
    res.status(response.status);
    for (const [k, v] of response.headers) res.setHeader(k, v);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    console.error('[server.js API error]', e);
    recordException(e, { path: req.originalUrl, method: req.method });
    res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

for (const route of SPA_REWRITES) {
  app.get([route, `${route}/*`], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
}

app.use(express.static(PUBLIC_DIR, {
  extensions: ['html'],
  setHeaders: (res, filePath) => {
    // Hashed admin-app assets are immutable — safe to cache forever.
    // Everything else (the SPA's index.html/app.js/dev.html) must always
    // revalidate, or phones can keep running a stale cached copy for days
    // after a deploy and silently miss client-side bug fixes.
    if (filePath.includes(`${path.sep}admin${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

const port = process.env.PORT || 3000;
const httpServer = http.createServer(app);
setupWebSocket(httpServer, process.env);
httpServer.listen(port, () => console.log(`LearnGate server listening on port ${port} (WS on /ws)`));
