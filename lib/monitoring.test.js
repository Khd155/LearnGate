import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('lib/monitoring.js', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('tracks requests, errors, status codes and endpoints', async () => {
    const m = await import('./monitoring.js');
    m.recordRequest({ method: 'GET', path: '/api/messages/unread', status: 200, durationMs: 10, ip: '1.1.1.1', bytesIn: 0, bytesOut: 120 });
    m.recordRequest({ method: 'GET', path: '/api/messages/unread', status: 200, durationMs: 20, ip: '1.1.1.1', bytesIn: 0, bytesOut: 130 });
    m.recordRequest({ method: 'POST', path: '/api/messages', status: 500, durationMs: 40, ip: '2.2.2.2', bytesIn: 50, bytesOut: 20 });

    const stats = m.getStats();
    expect(stats.requests5m).toBe(3);
    expect(stats.errors5m).toBe(1);
    expect(stats.errorRate5m).toBeCloseTo(33.33, 1);
    expect(stats.statusCodes5m['200']).toBe(2);
    expect(stats.statusCodes5m['500']).toBe(1);
    expect(stats.bytesIn5m).toBe(50);
    expect(stats.bytesOut5m).toBe(270);

    const top = stats.topEndpoints.find((e) => e.endpoint === 'GET /api/messages/unread');
    expect(top).toBeTruthy();
    expect(top.requests).toBe(2);
    expect(top.avgDurationMs).toBe(15);
  });

  it('normalizes ids in endpoint paths so they aggregate together', async () => {
    const m = await import('./monitoring.js');
    m.recordRequest({ method: 'DELETE', path: '/api/messages/40aeecde-40b7-4a7a-8237-e21148d4844d', status: 200, durationMs: 5, ip: '1.1.1.1' });
    m.recordRequest({ method: 'DELETE', path: '/api/messages/df1b707c-742f-4f0b-919d-72f619615891', status: 200, durationMs: 5, ip: '1.1.1.1' });

    const stats = m.getStats();
    const ep = stats.topEndpoints.find((e) => e.endpoint === 'DELETE /api/messages/:id');
    expect(ep).toBeTruthy();
    expect(ep.requests).toBe(2);
  });

  it('raises a critical alert on high error rate, and none when traffic is too low to judge', async () => {
    const m = await import('./monitoring.js');
    // Below the 10-request floor — must NOT alert even at 100% error rate.
    for (let i = 0; i < 3; i++) m.recordRequest({ method: 'GET', path: '/x', status: 500, durationMs: 5, ip: '1.1.1.1' });
    let stats = m.getStats();
    expect(stats.alerts.find((a) => a.message.includes('نسبة الأخطاء'))).toBeUndefined();

    // Push past the floor with a high error rate — must alert now.
    for (let i = 0; i < 10; i++) m.recordRequest({ method: 'GET', path: '/x', status: 500, durationMs: 5, ip: '1.1.1.1' });
    stats = m.getStats();
    const alert = stats.alerts.find((a) => a.message.includes('نسبة الأخطاء'));
    expect(alert).toBeTruthy();
    expect(alert.level).toBe('critical');
  });

  it('tracks failed logins and rate-limit hits, and alerts past threshold', async () => {
    const m = await import('./monitoring.js');
    for (let i = 0; i < 12; i++) m.recordSecurityEvent('failed_login', { action: 'student-login', ip: '9.9.9.9', accountKey: '1234567890' });
    const stats = m.getStats();
    expect(stats.failedLogins5m).toBe(12);
    expect(stats.alerts.some((a) => a.message.includes('محاولات دخول فاشلة'))).toBe(true);

    const security = m.getSecuritySummary(15);
    expect(security.topFailedLoginIps[0]).toEqual({ ip: '9.9.9.9', count: 12 });
  });

  it('getLogs filters by type', async () => {
    const m = await import('./monitoring.js');
    m.recordRequest({ method: 'GET', path: '/a', status: 200, durationMs: 1, ip: '1.1.1.1' });
    m.recordException(new Error('boom'), { path: '/b' });
    const errorLogs = m.getLogs(50, 'exception');
    expect(errorLogs.length).toBe(1);
    expect(errorLogs[0].message).toBe('boom');
  });
});
