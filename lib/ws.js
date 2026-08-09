// Minimal real-time layer: a single WebSocket server attached to the same
// HTTP server as Express. This is a first experiment to confirm the hosting
// platform (CranL) keeps long-lived WS connections alive in production —
// once confirmed, real events (new message / new ticket reply) can be piped
// through broadcastToStudent/broadcastToAdmins instead of client polling.
import { WebSocketServer } from 'ws';

const _b64uDec = (s) => {
  const str = s.replace(/-/g, '+').replace(/_/g, '/');
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
};

async function jwtVerify(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, b, s] = parts;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigStr = s.replace(/-/g, '+').replace(/_/g, '/');
    const sigPadded = sigStr + '='.repeat((4 - (sigStr.length % 4)) % 4);
    const sig = Uint8Array.from(Buffer.from(sigPadded, 'base64'));
    const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(`${h}.${b}`));
    if (!valid) return null;
    const payload = JSON.parse(_b64uDec(b));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

// room key -> Set<WebSocket>
const rooms = new Map();

function joinRoom(room, ws) {
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(ws);
}

function leaveAllRooms(ws) {
  for (const set of rooms.values()) set.delete(ws);
}

function sendJson(ws, data) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
}

function broadcastToRoom(room, event) {
  const set = rooms.get(room);
  if (!set) return 0;
  for (const ws of set) sendJson(ws, event);
  return set.size;
}

function broadcastToStudent(studentId, event) {
  return broadcastToRoom(`student:${studentId}`, event);
}

function broadcastToAdmins(event) {
  return broadcastToRoom('role:admin', event);
}

function broadcastToAll(event) {
  let count = 0;
  for (const ws of allClients) { sendJson(ws, event); count++; }
  return count;
}

function getConnectionCount() {
  return allClients.size;
}

const allClients = new Set();

function setupWebSocket(httpServer, env) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', async (ws, request) => {
    const url = new URL(request.url, 'http://localhost');
    const token = url.searchParams.get('token') || '';
    const devKey = url.searchParams.get('devkey') || '';

    // Dev-key bypass for the /devtools/monitoring test client only — same trust
    // level as the existing X-Dev-Key HTTP auth used across the API.
    const isDevKey = !!env.DEV_KEY && devKey === env.DEV_KEY;
    const claims = isDevKey ? { role: 'admin', sub: 'dev' } : await jwtVerify(token, env.JWT_SECRET || '');

    if (!claims) {
      sendJson(ws, { type: 'error', message: 'unauthorized' });
      ws.close(4001, 'unauthorized');
      return;
    }

    allClients.add(ws);
    if (claims.role === 'student') joinRoom(`student:${claims.sub}`, ws);
    if (['admin', 'director', 'dev', 'support'].includes(claims.role)) joinRoom('role:admin', ws);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    sendJson(ws, { type: 'connected', role: claims.role });

    ws.on('close', () => {
      allClients.delete(ws);
      leaveAllRooms(ws);
    });

    ws.on('error', () => {
      allClients.delete(ws);
      leaveAllRooms(ws);
    });
  });

  // Drop dead connections (client tab closed without a clean close frame).
  const heartbeat = setInterval(() => {
    for (const ws of allClients) {
      if (ws.isAlive === false) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30000);
  wss.on('close', () => clearInterval(heartbeat));

  // Lets functions/api/[[route]].js push real-time events without importing
  // the 'ws' package directly — that file also runs under Cloudflare Pages
  // Functions, which has no 'ws' module and no persistent process to hold
  // these rooms in memory.
  globalThis.__wsBroadcastStudent = broadcastToStudent;
  globalThis.__wsBroadcastAdmins = broadcastToAdmins;

  return wss;
}

export { setupWebSocket, broadcastToStudent, broadcastToAdmins, broadcastToAll, getConnectionCount };
