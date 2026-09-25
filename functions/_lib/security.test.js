import { describe, it, expect } from 'vitest';
import { safeEqual, secureRandomInt, secureDigits, devKeyMatches, isUsableDevKey } from './security.js';

describe('safeEqual', () => {
  it('is true only for identical strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('abcd', 'abc')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
  it('treats null/undefined as empty and never equal to a real value', () => {
    expect(safeEqual(undefined, 'x')).toBe(false);
    expect(safeEqual(null, '')).toBe(true);
  });
  it('handles unicode', () => {
    expect(safeEqual('مفتاح', 'مفتاح')).toBe(true);
    expect(safeEqual('مفتاح', 'مفتاخ')).toBe(false);
  });
});

describe('devKeyMatches', () => {
  const KEY = 'Str0ng-Key#42x';
  it('accepts the exact configured key', () => expect(devKeyMatches(KEY, KEY)).toBe(true));
  it('rejects wrong / missing keys', () => {
    expect(devKeyMatches('nope', KEY)).toBe(false);
    expect(devKeyMatches('', KEY)).toBe(false);
    expect(devKeyMatches(undefined, KEY)).toBe(false);
  });
  it('never authorizes when the configured key is empty, missing or too short', () => {
    expect(devKeyMatches('', '')).toBe(false); // the classic "DEV_KEY set but empty" hole
    expect(devKeyMatches('', undefined)).toBe(false);
    expect(devKeyMatches('short', 'short')).toBe(false);
    expect(isUsableDevKey('x'.repeat(8))).toBe(true);
    expect(isUsableDevKey('x'.repeat(7))).toBe(false);
    expect(devKeyMatches('AbCdEf1#xyz', 'AbCdEf1#xyz')).toBe(true); // an 11-char key (the length in use) must still work
  });
});

describe('secure random', () => {
  it('secureRandomInt stays in range and validates its input', () => {
    for (let i = 0; i < 500; i++) { const v = secureRandomInt(7); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(7); }
    expect(() => secureRandomInt(0)).toThrow();
    expect(() => secureRandomInt(1.5)).toThrow();
    expect(secureRandomInt(1)).toBe(0);
  });
  it('secureDigits returns exactly n digits, including leading zeros', () => {
    for (let i = 0; i < 200; i++) expect(secureDigits(8)).toMatch(/^\d{8}$/);
    expect(secureDigits(6)).toHaveLength(6);
  });
  it('covers all ten digits over many draws (sanity check on uniformity)', () => {
    const seen = new Set(); for (let i = 0; i < 400; i++) seen.add(secureDigits(1));
    expect(seen.size).toBe(10);
  });
});
