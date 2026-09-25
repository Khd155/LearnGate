// Request-body size limiting for the API proxy in server.js. Reading a body with no ceiling lets any
// unauthenticated caller exhaust the process memory with one huge POST, so every read is capped.

export const DEFAULT_BODY_LIMIT = 2 * 1024 * 1024;      // 2 MB — every normal JSON call
export const IMPORT_BODY_LIMIT = 10 * 1024 * 1024;     // 10 MB — bulk imports (questions / students / general tests)

export class PayloadTooLargeError extends Error {
  constructor(limit) {
    super('Payload Too Large');
    this.name = 'PayloadTooLargeError';
    this.status = 413;
    this.limit = limit;
  }
}

/**
 * The byte ceiling for a request: bulk-import style endpoints get more room, but only when the caller at least
 * presents credentials (the real authorization check happens later) — an anonymous request never gets more than 2 MB.
 */
export function bodyLimitFor(path, hasCredentials = false) {
  const bulk = /\/(import|bulk|questions|general-tests|seed)/i.test(String(path || ''));
  return bulk && hasCredentials ? IMPORT_BODY_LIMIT : DEFAULT_BODY_LIMIT;
}

/**
 * Collect a Node request stream into a Buffer without ever holding more than `limit` bytes.
 * Rejects immediately when the declared Content-Length already exceeds the limit, and stops
 * reading as soon as the running total does (a lying / chunked client cannot get past it).
 */
export async function readBodyLimited(req, limit = DEFAULT_BODY_LIMIT) {
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > limit) throw new PayloadTooLargeError(limit);
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new PayloadTooLargeError(limit);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
