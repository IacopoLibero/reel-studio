import { describe, expect, it } from 'vitest';
import {
  addDays, dayOfWeek, isValidSlotFormat, minutesAhead, nextFreeSlots, romeWallTime, romeWallToInstant, slotTimesFor,
} from '../slots.js';

describe('slots', () => {
  it('uses 3 slots on Sun/Tue/Thu and 2 on other days', () => {
    expect(slotTimesFor('2026-11-22')).toEqual(['08:00', '16:30', '19:00']); // Sun
    expect(slotTimesFor('2026-11-24')).toEqual(['08:00', '16:30', '19:00']); // Tue
    expect(slotTimesFor('2026-11-26')).toEqual(['08:00', '16:30', '19:00']); // Thu
    for (const d of ['2026-11-20', '2026-11-21', '2026-11-23', '2026-11-25']) {
      expect(slotTimesFor(d)).toEqual(['07:30', '17:30']);
    }
  });

  it('day math', () => {
    expect(dayOfWeek('2026-11-19')).toBe(4);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('converts Rome wall time both ways, across DST', () => {
    expect(romeWallToInstant('2026-11-19T16:30').toISOString()).toBe('2026-11-19T15:30:00.000Z');
    expect(romeWallToInstant('2026-07-01T16:30').toISOString()).toBe('2026-07-01T14:30:00.000Z');
    expect(romeWallTime(new Date('2026-11-19T15:30:00Z'))).toBe('2026-11-19T16:30');
    expect(() => romeWallToInstant('nope')).toThrow();
    expect(isValidSlotFormat('2026-11-19T16:30')).toBe(true);
    expect(isValidSlotFormat('2026-11-19 16:30')).toBe(false);
  });

  it('returns the next free slots skipping used ones', () => {
    const now = new Date('2026-11-19T10:00:00Z'); // Thu 11:00 Rome
    const used = ['2026-11-19T16:30', '2026-11-20T07:30'];
    expect(nextFreeSlots(used, 4, now)).toEqual([
      '2026-11-19T19:00', '2026-11-20T17:30', '2026-11-21T07:30', '2026-11-21T17:30',
    ]);
  });

  it('skips slots under 20 minutes ahead', () => {
    const now = new Date('2026-11-19T15:15:00Z'); // 16:15 Rome, 16:30 is 15 min away
    expect(nextFreeSlots([], 1, now)).toEqual(['2026-11-19T19:00']);
    expect(minutesAhead('2026-11-19T19:00', now)).toBe(165);
  });

  it('works with default now and rolls over the year', () => {
    expect(nextFreeSlots([], 3)).toHaveLength(3);
    expect(nextFreeSlots([], 1, new Date('2026-12-31T23:00:00Z'))[0].startsWith('2027-01-01')).toBe(true);
  });
});
