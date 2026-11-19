import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCaption, expectedInstagramLength, lastHashtag, normalizeCaption, readCaption } from '../caption.js';

describe('caption', () => {
  it('counts emoji above U+FFFF twice', () => {
    expect(expectedInstagramLength('abc')).toBe(3);
    expect(expectedInstagramLength('a🎁b')).toBe(4);
    expect(expectedInstagramLength('é✨')).toBe(2); // BMP chars count once
  });

  it('normalizes line endings and trailing whitespace', () => {
    expect(normalizeCaption('a\r\nb\r\n\n')).toBe('a\nb');
  });

  it('reads a file', async () => {
    const d = await mkdtemp(join(tmpdir(), 'cap-'));
    await writeFile(join(d, 'caption.md'), 'Hi 🎁\n\n#tag\n');
    expect(await readCaption(join(d, 'caption.md'))).toBe('Hi 🎁\n\n#tag');
  });

  it('finds the last hashtag', () => {
    expect(lastHashtag('x #a #b_1\n')).toBe('#b_1');
    expect(lastHashtag('none')).toBeNull();
  });

  it('accepts a matching caption and flags problems', () => {
    const c = 'Hello 🎁\n\n#a #b';
    expect(checkCaption(c, c).ok).toBe(true);
    expect(checkCaption(c, c.replace('#b', '%23b')).problems.join()).toContain('%23');
    expect(checkCaption(c, 'Hello').ok).toBe(false);
    expect(checkCaption(c, 'Hello 🎁\n\n#a #c').problems.join()).toContain('#b');
    expect(checkCaption('x %23y', 'x %23y').problems.join()).toContain('caption.md');
  });
});
