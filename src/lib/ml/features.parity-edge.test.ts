// Parity edge-case test: the drift inputs the fixture generation never covers.
// Both mirrors must agree on what parses at all — Python's fromisoformat
// rejects impossible calendar dates and non-ISO text; the TS side used to
// accept them (new Date fallback, Date.UTC roll-over).
import { describe, expect, it } from 'vitest';
import { extract } from './features';

const video = (publishedAt: string) => ({
  title: 't', description: 'd', tags: [],
  publishedAt, duration: 'PT60S', viewCount: 100, likeCount: 10, commentCount: 1,
});
const channel = { publishedAt: '2020-01-01T00:00:00Z', subscribers: 100, videoCount: 5 };

describe('parseTime parity edges', () => {
  it('rejects non-ISO text the same as Python (age 0, not machine-zone dependent)', () => {
    const row = extract(video('March 4, 2026'), channel);
    expect(row.age_days_log).toBe(0);
  });

  it('rejects impossible calendar dates (2026-02-31) like fromisoformat', () => {
    const row = extract(video('2026-02-31'), channel);
    expect(row.age_days_log).toBe(0);
    expect(row.publish_dow).toBe(0);
  });

  it('accepts strict ISO with Z like fromisoformat', () => {
    const row = extract(video('2026-03-04T09:15:00Z'), channel);
    expect(row.age_days_log).toBeGreaterThan(0);
    expect(row.publish_hour).toBe(9);
  });

  it('accepts date-only ISO as UTC midnight on both sides', () => {
    const row = extract(video('2026-03-04'), channel);
    expect(row.age_days_log).toBeGreaterThan(0);
  });
});
