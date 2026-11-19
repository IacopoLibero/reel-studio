import { describe, expect, it } from 'vitest';
import {
  captionStartOf, isoToWall, parseTimeLabel, parseWeek, parseWeekTitle, postId, resolveWeekDates, romeOffset, toIso, wallToIso,
} from '../calendar.js';
import { withLock } from '../lock.js';

describe('time label', () => {
  it('handles 12 AM / 12 PM and normal hours', () => {
    expect(parseTimeLabel('12:00 AM')).toEqual({ hour24: 0, minute: 0 });
    expect(parseTimeLabel('12:30 PM')).toEqual({ hour24: 12, minute: 30 });
    expect(parseTimeLabel('7:00 AM')).toEqual({ hour24: 7, minute: 0 });
    expect(parseTimeLabel('7:30 PM')).toEqual({ hour24: 19, minute: 30 });
    expect(parseTimeLabel('11:59 pm')).toEqual({ hour24: 23, minute: 59 });
  });
  it('rejects garbage', () => {
    for (const bad of ['', '13:00 AM', '0:10 AM', '7:60 AM', '7 AM']) expect(() => parseTimeLabel(bad)).toThrow();
  });
});

describe('week title and dates', () => {
  it('parses one and two month titles', () => {
    expect(parseWeekTitle('November 2026')).toEqual({ firstMonth: 11, firstYear: 2026 });
    expect(parseWeekTitle('November – December 2026')).toEqual({ firstMonth: 11, firstYear: 2026 });
    expect(parseWeekTitle('December – January 2027')).toEqual({ firstMonth: 12, firstYear: 2026 });
    expect(parseWeekTitle('December 2026 – January 2027')).toEqual({ firstMonth: 12, firstYear: 2026 });
    expect(() => parseWeekTitle('Weekly')).toThrow();
  });
  it('rolls the month and the year over', () => {
    expect(resolveWeekDates('November – December 2026', [29, 30, 1, 2, 3, 4, 5]).map((d) => `${d.month}/${d.day}`))
      .toEqual(['11/29', '11/30', '12/1', '12/2', '12/3', '12/4', '12/5']);
    const y = resolveWeekDates('December 2026 – January 2027', [27, 28, 29, 30, 31, 1, 2]);
    expect(y[4]).toEqual({ year: 2026, month: 12, day: 31 });
    expect(y[5]).toEqual({ year: 2027, month: 1, day: 1 });
  });
});

describe('iso', () => {
  it('uses the Rome offset (winter and summer)', () => {
    expect(romeOffset('2026-11-19T16:00')).toBe('+01:00');
    expect(romeOffset('2026-07-01T16:00')).toBe('+02:00');
    expect(toIso({ year: 2026, month: 11, day: 19 }, '4:00 PM')).toBe('2026-11-19T16:00:00+01:00');
    expect(toIso({ year: 2026, month: 11, day: 20 }, '12:00 AM')).toBe('2026-11-20T00:00:00+01:00');
    expect(wallToIso('2026-11-19T07:30')).toBe('2026-11-19T07:30:00+01:00');
  });
  it('round trips to a Rome wall time', () => {
    expect(isoToWall('2026-11-19T16:00:00+01:00')).toBe('2026-11-19T16:00');
    expect(isoToWall('2026-11-19T15:00:00Z')).toBe('2026-11-19T16:00');
    expect(() => isoToWall('x')).toThrow();
  });
});

describe('parseWeek', () => {
  const headers = ['Sun 29', 'Mon 30', 'Tue 1'].map((label, i) => ({ label, left: i * 100, right: i * 100 + 90 }));
  it('assigns posts to columns and builds stable ids', () => {
    const raw = {
      title: 'November – December 2026', headers,
      posts: [
        { text: 'Hello world 👇\n\n📌 more\n7:00 AM', left: 5, right: 80 },
        { text: 'Second\n5:30 PM', left: 205, right: 290 },
        { text: 'Outside\n5:30 PM', left: 900, right: 990 },
      ],
    };
    const out = parseWeek(raw);
    expect(out.map((p) => p.scheduledAt)).toEqual(['2026-11-29T07:00:00+01:00', '2026-12-01T17:30:00+01:00']);
    expect(out[0].captionStart).toBe('Hello world 👇');
    expect(out[0].id).toBe(postId('Hello world 👇', '2026-11-29T07:00:00+01:00'));
    expect(parseWeek(raw)[0].id).toBe(out[0].id);
    expect(out[0].id).not.toBe(out[1].id);
  });
  it('cuts the caption start at 60 chars', () => {
    expect(captionStartOf('x'.repeat(100) + '\nsecond')).toHaveLength(60);
  });
});

describe('lock', () => {
  it('runs tasks one after another, even after a failure', async () => {
    const log: string[] = [];
    const slow = withLock(async () => { log.push('a1'); await new Promise((r) => setTimeout(r, 30)); log.push('a2'); });
    const bad = withLock(async () => { log.push('b'); throw new Error('x'); });
    const last = withLock(async () => { log.push('c'); return 1; });
    await slow; await expect(bad).rejects.toThrow('x');
    expect(await last).toBe(1);
    expect(log).toEqual(['a1', 'a2', 'b', 'c']);
  });
});
