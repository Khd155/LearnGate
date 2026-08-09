// Lightweight in-process monitoring: request/error logging + rolling metrics.
// No external service — everything lives in memory for the life of the
// process, which is fine since this runs on a single long-lived Node
// process (CranL/Railpack), not a serverless function.

const MAX_LOG_LINES = 500;
const MINUTE_BUCKETS = 60; // keep the last 60 one-minute buckets (1h of history)

const state = {
  logs: [], // ring buffer of recent access/error log lines
  buckets: new Map(), // minuteKey -> { requests, errors, totalDuration }
  startedAt: Date.now(),
};

function minuteKey(ts) {
  return Math.floor(ts / 60000);
}

function getBucket(ts) {
  const key = minuteKey(ts);
  let b = state.buckets.get(key);
  if (!b) {
    b = { key, requests: 0, errors: 0, totalDuration: 0 };
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

// Called once per finished HTTP request.
function recordRequest({ method, path, status, durationMs, ip }) {
  const now = Date.now();
  const bucket = getBucket(now);
  bucket.requests++;
  bucket.totalDuration += durationMs;
  const isError = status >= 500;
  if (isError) bucket.errors++;

  pushLog({
    type: isError ? 'error' : 'access',
    time: new Date(now).toISOString(),
    method,
    path,
    status,
    durationMs,
    ip,
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

// Returns aggregate stats for the /dev/monitoring dashboard.
function getStats() {
  const now = Date.now();
  const nowKey = minuteKey(now);
  const last5 = [];
  for (let i = 0; i < 5; i++) {
    const b = state.buckets.get(nowKey - i);
    if (b) last5.push(b);
  }
  const requests5m = last5.reduce((s, b) => s + b.requests, 0);
  const errors5m = last5.reduce((s, b) => s + b.errors, 0);
  const duration5m = last5.reduce((s, b) => s + b.totalDuration, 0);

  const currentBucket = state.buckets.get(nowKey);
  const requestsPerMinute = currentBucket ? currentBucket.requests : 0;

  const timeline = Array.from(state.buckets.values())
    .sort((a, b) => a.key - b.key)
    .slice(-30)
    .map((b) => ({
      minute: new Date(b.key * 60000).toISOString(),
      requests: b.requests,
      errors: b.errors,
      avgDurationMs: b.requests ? Math.round(b.totalDuration / b.requests) : 0,
    }));

  return {
    uptimeSeconds: Math.floor((now - state.startedAt) / 1000),
    requestsPerMinute,
    errorRate5m: requests5m ? +((errors5m / requests5m) * 100).toFixed(2) : 0,
    avgResponseMs5m: requests5m ? Math.round(duration5m / requests5m) : 0,
    requests5m,
    errors5m,
    timeline,
  };
}

function getLogs(limit = 100) {
  return state.logs.slice(-limit).reverse();
}

export { recordRequest, recordException, getStats, getLogs };
