import { describe, it, expect } from 'vitest';
import { resolvePoolMax, DEFAULT_POOL_MAX } from './db.js';

describe('resolvePoolMax', () => {
  it('defaults to a small real pool instead of a single connection', () => {
    expect(DEFAULT_POOL_MAX).toBeGreaterThan(1);
    expect(resolvePoolMax({})).toBe(DEFAULT_POOL_MAX);
    expect(resolvePoolMax()).toBe(DEFAULT_POOL_MAX);
  });
  it('honours PG_POOL_MAX, capped at 20', () => {
    expect(resolvePoolMax({ PG_POOL_MAX: '8' })).toBe(8);
    expect(resolvePoolMax({ PG_POOL_MAX: '500' })).toBe(20);
  });
  it('ignores junk and non-positive values', () => {
    for (const v of ['', 'abc', '0', '-3', undefined, null]) expect(resolvePoolMax({ PG_POOL_MAX: v })).toBe(DEFAULT_POOL_MAX);
  });
});
