import { inflateRawSync } from "node:zlib";

export class ZipError extends Error {}

export interface ZipEntry { name: string; data: Buffer }
export interface ZipLimits { maxEntries: number; maxEntryBytes: number; maxTotalBytes: number }
export const DEFAULT_ZIP_LIMITS: ZipLimits = { maxEntries: 300, maxEntryBytes: 25_000_000, maxTotalBytes: 40_000_000 };

/**
 * A small zip reader (stored and deflate entries, no encryption, no zip64) so a brand can be imported without a new dependency.
 * Sizes are checked before and while inflating, so a zip bomb is refused. Folders are skipped; symbolic links are refused.
 */
export function readZip(buf: Buffer, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new ZipError("This is not a valid zip file.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count > limits.maxEntries) throw new ZipError(`The zip has too many files (the limit is ${limits.maxEntries}).`);
  const out: ZipEntry[] = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ZipError("The zip index is damaged.");
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const mode = buf.readUInt32LE(p + 38) >>> 16, local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    if ((mode & 0xf000) === 0xa000) throw new ZipError(`"${name}" is a symbolic link, which is not allowed.`);
    if (flags & 1) throw new ZipError("The zip is encrypted.");
    if (csize === 0xffffffff || usize === 0xffffffff) throw new ZipError("Zip64 files are not supported.");
    if (usize > limits.maxEntryBytes) throw new ZipError(`"${name}" is too big (the limit is ${limits.maxEntryBytes / 1_000_000} MB per file).`);
    total += usize;
    if (total > limits.maxTotalBytes) throw new ZipError(`The zip is too big once unpacked (the limit is ${limits.maxTotalBytes / 1_000_000} MB).`);
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new ZipError("The zip index is damaged.");
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    if (raw.length !== csize) throw new ZipError("The zip is cut short.");
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try { data = inflateRawSync(raw, { maxOutputLength: usize + 1 }); } catch { throw new ZipError(`"${name}" is damaged or larger than it says.`); }
    } else throw new ZipError(`"${name}" uses a compression method that is not supported.`);
    if (data.length !== usize) throw new ZipError(`"${name}" does not match its recorded size.`);
    out.push({ name, data });
  }
  return out;
}
