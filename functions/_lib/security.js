// Small, dependency-free security helpers shared by the API (runs on Node and on
// Cloudflare Pages Functions, so this only uses the WebCrypto `crypto` global).

/** Constant-time string equality: the time taken does not depend on where the strings first differ. */
export function safeEqual(a, b) {
  const x = String(a ?? '');
  const y = String(b ?? '');
  const len = Math.max(x.length, y.length);
  // fold the length difference into the result so unequal lengths never compare equal
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

/** Uniform random integer in [0, max) from a CSPRNG (rejection sampling, no modulo bias). */
export function secureRandomInt(max) {
  if (!Number.isInteger(max) || max < 1 || max > 2 ** 32) throw new RangeError('max out of range');
  const limit = Math.floor(2 ** 32 / max) * max;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % max;
}

/** A zero-padded string of `n` random decimal digits (CSPRNG). */
export function secureDigits(n) {
  let out = '';
  for (let i = 0; i < n; i++) out += String(secureRandomInt(10));
  return out;
}

/** True when a dev key is configured well enough to be accepted at all (never an empty or trivially short secret). */
export const MIN_DEV_KEY_LENGTH = 8;
export function isUsableDevKey(key) {
  return typeof key === 'string' && key.length >= MIN_DEV_KEY_LENGTH;
}

/** Whether a presented dev key matches the configured one — constant time, and never true for a weak/empty configured key. */
export function devKeyMatches(presented, configured) {
  return isUsableDevKey(configured) && safeEqual(presented, configured);
}
