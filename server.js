// Node.js server for hosting on platforms that run a real process listening
// on a port (CranL/Railpack). Reuses the same /api logic as functions/api —
// only the request/response transport and the env source (process.env) differ.
import express from 'express';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { onRequest } from './functions/api/[[route]].js';
import { recordRequest, recordException, recordSecurityEvent, getStats, getLogs, getSecuritySummary } from './lib/monitoring.js';
import { setupWebSocket, broadcastToAll, getConnectionCount } from './lib/ws.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public', 'khaldiya');

// Lets functions/api/[[route]].js report failed logins / rate-limit hits
// without importing lib/monitoring.js directly — that file also runs under
// Cloudflare Pages Functions, which has no persistent process to hold this
// in-memory state (same globalThis-hook pattern as __wsBroadcastStudent).
globalThis.__recordSecurityEvent = recordSecurityEvent;

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
// method, path, status, duration, size and IP into an in-memory rolling window.
app.use((req, res, next) => {
  const startedAt = Date.now();
  const bytesIn = Number(req.get('content-length')) || 0;
  res.on('finish', () => {
    recordRequest({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip || 'unknown',
      bytesIn,
      // Only reflects an explicit Content-Length header (set by res.json()/
      // express.static's file serving); chunked/streamed responses without
      // one are undercounted here rather than measured byte-for-byte — fine
      // for a rough traffic-volume gauge, not billing-grade accounting.
      bytesOut: Number(res.get('content-length')) || 0,
    });
  });
  next();
});

// ── Developer monitoring APIs (protected by X-Dev-Key / ?key=) ────────────
// Registered before the generic '/api' catch-all below, since that handler
// responds to every /api/* request itself and would otherwise shadow these.
app.get('/api/dev/monitoring/stats', (req, res) => {
  if (!devAuthorized(req)) return res.status(403).json({ error: 'غير مسموح' });
  res.json({ ...getStats(), wsConnections: getConnectionCount() });
});

app.get('/api/dev/monitoring/logs', (req, res) => {
  if (!devAuthorized(req)) return res.status(403).json({ error: 'غير مسموح' });
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const type = req.query.type || null; // 'access' | 'error' | 'exception' | 'failed_login' | 'rate_limit'
  res.json({ logs: getLogs(limit, type) });
});

// Failed-login / rate-limit hits grouped by source IP over a recent window —
// the "is this one IP doing something weird" view, separate from the raw log.
app.get('/api/dev/monitoring/security', (req, res) => {
  if (!devAuthorized(req)) return res.status(403).json({ error: 'غير مسموح' });
  const windowMinutes = Math.min(Number(req.query.window) || 15, 60);
  res.json(getSecuritySummary(windowMinutes));
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

// SPA fallback — any GET request that reaches here wasn't a real static file
// (express.static above already tried and failed) and isn't a "/admin/*"
// path (the React admin app, excluded so its own missing-asset 404s stay
// real). If it also has no file extension — i.e. it looks like an in-app
// route (/quiz-skills/progress, /history, whatever screen the SPA can show)
// rather than a missing asset (/foo.png) — serve index.html and let the
// client-side router take it from there. This replaces a hardcoded list of
// ~8 known routes that 404'd on refresh/direct-navigation/back-button for
// every screen not on that list; a real asset 404 (has an extension) still
// gets a real 404 either way.
app.use((req, res) => {
  const isRealAsset = path.extname(req.path) !== '';
  if (req.method === 'GET' && !req.path.startsWith('/admin') && !isRealAsset) {
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

const port = process.env.PORT || 3000;
const httpServer = http.createServer(app);
setupWebSocket(httpServer, process.env);
httpServer.listen(port, () => console.log(`LearnGate server listening on port ${port} (WS on /ws)`));
