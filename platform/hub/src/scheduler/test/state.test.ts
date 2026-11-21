import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  hubDataDir, isReelScheduled, isSlotTaken, readState, recordScheduled, reelKey, scheduledFile, usedSlots,
  withEntry, writeState,
} from '../state.js';

describe('state', () => {
  const old = process.env.HUB_DATA;
  afterEach(() => { if (old === undefined) delete process.env.HUB_DATA; else process.env.HUB_DATA = old; });

  it('derives keys', () => {
    expect(reelKey('/x/reels/acme/9-foo/')).toBe('acme/9-foo');
    expect(reelKey('/x/other/9-foo')).toBe('9-foo');
  });

  it('paths follow HUB_DATA', () => {
    process.env.HUB_DATA = '/tmp/hd';
    expect(hubDataDir()).toBe('/tmp/hd');
    expect(scheduledFile()).toBe('/tmp/hd/scheduled.json');
    delete process.env.HUB_DATA;
    expect(hubDataDir()).toContain('platform/data');
  });

  it('reads empty when missing, records without mutating, rejects bad content', async () => {
    const d = await mkdtemp(join(tmpdir(), 'st-'));
    const f = join(d, 'sub', 'scheduled.json');
    expect(await readState(f)).toEqual({});
    const a = {};
    const b = withEntry(a, 'r1', { slot: '2026-11-20T17:30', scheduledAt: 'now' });
    expect(a).toEqual({});
    expect(isReelScheduled(b, 'r1')).toBe(true);
    expect(isSlotTaken(b, '2026-11-20T17:30')).toBe(true);
    expect(isSlotTaken(b, 'zzz')).toBe(false);
    expect(usedSlots(b)).toEqual(['2026-11-20T17:30']);
    await writeState(b, f);
    await recordScheduled('r2', { slot: 's2', scheduledAt: 'n' }, f);
    expect(Object.keys(JSON.parse(await readFile(f, 'utf8')))).toEqual(['r1', 'r2']);
    await writeFile(f, '[1]');
    await expect(readState(f)).rejects.toThrow();
    await writeFile(f, '{bad');
    await expect(readState(f)).rejects.toThrow();
  });
});
