// Lightweight in-process monitoring: request/error logging + rolling metrics
// + security-event tracking (failed logins, rate-limit hits) + basic alert
// thresholds. No external service — everything lives in memory for the life
// of the process, which is fine since this runs on a single long-lived Node
// process (CranL/Railpack), not a serverless function.

const MAX_LOG_LINES = 800;
const MINUTE_BUCKETS = 60; // keep the last 60 one-minute buckets (1h of history)
const TOP_ENDPOINTS_LIMIT = 12;

const state = {
  logs: [], // ring buffer of recent access/error/security log lines
  buckets: new Map(), // minuteKey -> per-minute aggregate (see getBucket)
  startedAt: Date.now(),
};

function minuteKey(ts) {
  return Math.floor(ts / 60000);
}

function getBucket(ts) {
  const key = minuteKey(ts);
  let b = state.buckets.get(key);
  if (!b) {
    b = {
      key, requests: 0, errors: 0, totalDuration: 0,
      bytesIn: 0, bytesOut: 0,
      statusCodes: {}, // '200' -> count
      endpoints: {},   // 'GET /messages' -> { requests, errors, totalDuration }
      failedLogins: 0, rateLimitHits: 0,
    };
    state.buckets.set(key, b);
    // trim old buckets
    if (state.buckets.size > MINUTE_BUCKETS) {
      const oldestKey = Math.min(...state.buckets.keys());
      state.buckets.delete(oldestKey);
    }
  }
  return b;
}

function pushLog(entry) {
  state.logs.push(entry);
  if (state.logs.length > MAX_LOG_LINES) state.logs.shift();
}

// Collapses path params so /messages/abc123 and /messages/def456 count as
// the same endpoint instead of fragmenting the "top endpoints" breakdown —
// anything that looks like an id (uuid, long alnum token, pure digits) is
// replaced with `:id`.
function normalizeEndpoint(path) {
  const noQuery = path.split('?')[0];
  return noQuery
    .split('/')
    .map((seg) => (/^[0-9a-f-]{8,}$/i.test(seg) || /^\d+$/.test(seg) ? ':id' : seg))
    .join('/');
}

// Called once per finished HTTP request.
function recordRequest({ method, path, status, durationMs, ip, bytesIn = 0, bytesOut = 0 }) {
  const now = Date.now();
  const bucket = getBucket(now);
  bucket.requests++;
  bucket.totalDuration += durationMs;
  bucket.bytesIn += bytesIn;
  bucket.bytesOut += bytesOut;
  const isError = status >= 500;
  if (isError) bucket.errors++;

  const codeKey = String(status);
  bucket.statusCodes[codeKey] = (bucket.statusCodes[codeKey] || 0) + 1;

  const epKey = `${method} ${normalizeEndpoint(path)}`;
  if (!bucket.endpoints[epKey]) bucket.endpoints[epKey] = { requests: 0, errors: 0, totalDuration: 0 };
  const ep = bucket.endpoints[epKey];
  ep.requests++;
  ep.totalDuration += durationMs;
  if (isError) ep.errors++;

  pushLog({
    type: isError ? 'error' : 'access',
    time: new Date(now).toISOString(),
    method, path, status, durationMs, ip,
  });
}

// Called for unhandled exceptions / caught errors worth surfacing.
function recordException(err, context) {
  pushLog({
    type: 'exception',
    time: new Date().toISOString(),
    message: err?.message || String(err),
    stack: err?.stack || null,
    context: context || null,
  });
}

// Called for failed-login attempts and rate-limit rejections (see
// _recordSecurityEvent() in functions/api/[[route]].js — wired to this via
// globalThis so that file stays platform-agnostic).
function recordSecurityEvent(type, details) {
  const now = Date.now();
  const bucket = getBucket(now);
  if (type === 'failed_login') bucket.failedLogins++;
  if (type === 'rate_limit') bucket.rateLimitHits++;
  pushLog({ type, time: new Date(now).toISOString(), ...details });
}

function _sumLast(buckets, field) {
  return buckets.reduce((s, b) => s + b[field], 0);
}

// Returns aggregate stats + a basic alert list for the /dev/monitoring dashboard.
function getStats() {
  const now = Date.now();
  const nowKey = minuteKey(now);
  const last5 = [];
  for (let i = 0; i < 5; i++) {
    const b = state.buckets.get(nowKey - i);
    if (b) last5.push(b);
  }

  const requests5m = _sumLast(last5, 'requests');
  const errors5m = _sumLast(last5, 'errors');
  const duration5m = _sumLast(last5, 'totalDuration');
  const bytesIn5m = _sumLast(last5, 'bytesIn');
  const bytesOut5m = _sumLast(last5, 'bytesOut');
  const failedLogins5m = _sumLast(last5, 'failedLogins');
  const rateLimitHits5m = _sumLast(last5, 'rateLimitHits');

  const currentBucket = state.buckets.get(nowKey);
  const requestsPerMinute = currentBucket ? currentBucket.requests : 0;

  const statusCodes5m = {};
  for (const b of last5) {
    for (const [code, count] of Object.entries(b.statusCodes)) {
      statusCodes5m[code] = (statusCodes5m[code] || 0) + count;
    }
  }

  const endpointTotals = new Map();
  for (const b of last5) {
    for (const [ep, agg] of Object.entries(b.endpoints)) {
      const cur = endpointTotals.get(ep) || { endpoint: ep, requests: 0, errors: 0, totalDuration: 0 };
      cur.requests += agg.requests;
      cur.errors += agg.errors;
      cur.totalDuration += agg.totalDuration;
      endpointTotals.set(ep, cur);
    }
  }
  const topEndpoints = Array.from(endpointTotals.values())
    .map((e) => ({ ...e, avgDurationMs: e.requests ? Math.round(e.totalDuration / e.requests) : 0 }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, TOP_ENDPOINTS_LIMIT);

  const timeline = Array.from(state.buckets.values())
    .sort((a, b) => a.key - b.key)
    .slice(-30)
    .map((b) => ({
      minute: new Date(b.key * 60000).toISOString(),
      requests: b.requests,
      errors: b.errors,
      failedLogins: b.failedLogins,
      rateLimitHits: b.rateLimitHits,
      avgDurationMs: b.requests ? Math.round(b.totalDuration / b.requests) : 0,
    }));

  const errorRate5m = requests5m ? +((errors5m / requests5m) * 100).toFixed(2) : 0;
  const avgResponseMs5m = requests5m ? Math.round(duration5m / requests5m) : 0;

  // Deliberately simple, explainable thresholds rather than statistical
  // anomaly detection — easy to reason about and tune from direct experience
  // of what "too much" looks like on this specific app's normal traffic.
  const alerts = [];
  if (errorRate5m > 10 && requests5m >= 10) {
    alerts.push({ level: 'critical', message: `نسبة الأخطاء مرتفعة: ${errorRate5m}% خلال آخر 5 دقائق (${errors5m}/${requests5m} طلب)` });
  }
  if (avgResponseMs5m > 2000) {
    alerts.push({ level: 'warning', message: `زمن استجابة بطيء: متوسط ${avgResponseMs5m}ms خلال آخر 5 دقائق` });
  }
  if (failedLogins5m >= 10) {
    alerts.push({ level: 'warning', message: `محاولات دخول فاشلة كثيرة: ${failedLogins5m} خلال آخر 5 دقائق` });
  }
  if (rateLimitHits5m >= 20) {
    alerts.push({ level: 'warning', message: `تجاوزات rate-limit كثيرة: ${rateLimitHits5m} خلال آخر 5 دقائق` });
  }

  return {
    uptimeSeconds: Math.floor((now - state.startedAt) / 1000),
    requestsPerMinute,
    errorRate5m,
    avgResponseMs5m,
    requests5m,
    errors5m,
    bytesIn5m,
    bytesOut5m,
    failedLogins5m,
    rateLimitHits5m,
    statusCodes5m,
    topEndpoints,
    timeline,
    alerts,
  };
}

function getLogs(limit = 100, type = null) {
  const filtered = type ? state.logs.filter((l) => l.type === type) : state.logs;
  return filtered.slice(-limit).reverse();
}

// Groups recent failed-login/rate-limit log entries by IP so a single
// offending source is visible at a glance instead of buried in the raw log.
function getSecuritySummary(windowMinutes = 15) {
  const cutoff = Date.now() - windowMinutes * 60000;
  const recent = state.logs.filter((l) => new Date(l.time).getTime() >= cutoff);

  function topBy(type) {
    const counts = new Map();
    for (const l of recent) {
      if (l.type !== type) continue;
      const key = l.ip || 'unknown';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  return {
    windowMinutes,
    topFailedLoginIps: topBy('failed_login'),
    topRateLimitIps: topBy('rate_limit'),
  };
}

export { recordRequest, recordException, recordSecurityEvent, getStats, getLogs, getSecuritySummary };
