import { describe, it, expect } from 'vitest';
import { bodyLimitFor, readBodyLimited, PayloadTooLargeError, DEFAULT_BODY_LIMIT, IMPORT_BODY_LIMIT } from './body-limit.js';

const fakeReq = (chunks, headers = {}) => ({ headers, async *[Symbol.asyncIterator]() { for (const c of chunks) yield Buffer.from(c); } });

describe('bodyLimitFor', () => {
  it('uses 2 MB for normal calls and 10 MB only for bulk imports that present credentials', () => {
    expect(bodyLimitFor('/api/auth/student-login', true)).toBe(DEFAULT_BODY_LIMIT);
    expect(bodyLimitFor('/api/tickets', true)).toBe(DEFAULT_BODY_LIMIT);
    expect(bodyLimitFor('/api/questions', true)).toBe(IMPORT_BODY_LIMIT);
    expect(bodyLimitFor('/api/admin/students/import', true)).toBe(IMPORT_BODY_LIMIT);
    expect(bodyLimitFor('/api/questions', false)).toBe(DEFAULT_BODY_LIMIT); // anonymous never gets the big limit
    expect(bodyLimitFor(undefined)).toBe(DEFAULT_BODY_LIMIT);
  });
});

describe('readBodyLimited', () => {
  it('returns the whole body when it is within the limit', async () => {
    const buf = await readBodyLimited(fakeReq(['{"a":', '1}']), 100);
    expect(buf.toString()).toBe('{"a":1}');
  });
  it('rejects up front when Content-Length already exceeds the limit', async () => {
    await expect(readBodyLimited(fakeReq(['x'], { 'content-length': '999999' }), 1000)).rejects.toBeInstanceOf(PayloadTooLargeError);
  });
  it('stops as soon as the running total exceeds the limit (no/incorrect Content-Length)', async () => {
    let pulled = 0;
    const req = { headers: {}, async *[Symbol.asyncIterator]() { for (let i = 0; i < 1000; i++) { pulled++; yield Buffer.alloc(100); } } };
    await expect(readBodyLimited(req, 350)).rejects.toMatchObject({ status: 413 });
    expect(pulled).toBeLessThan(10); // did not keep draining the stream
  });
  it('accepts a body exactly at the limit', async () => {
    const buf = await readBodyLimited(fakeReq([Buffer.alloc(50)], {}), 50);
    expect(buf.length).toBe(50);
  });
});
