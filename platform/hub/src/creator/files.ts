/** Checks for the files a person hands to the brand creator. Everything is judged by content, never by the name the browser sends. */
export class FileError extends Error {}

export const MB = 1_000_000;
export const LIMITS = { logo: 1 * MB, voice: 25 * MB, sheet: 10 * MB, zip: 20 * MB } as const;
export type UploadKind = keyof typeof LIMITS;

const startsWith = (b: Buffer, sig: number[]): boolean => sig.every((v, i) => b[i] === v);

export const isPng = (b: Buffer): boolean => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const isJpeg = (b: Buffer): boolean => startsWith(b, [0xff, 0xd8, 0xff]);
export const isZip = (b: Buffer): boolean => startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06]);
export const isWav = (b: Buffer): boolean => b.length > 44 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WAVE";

export interface Checked { ext: string; mime: string }

/** Validates a file of one kind and says what it is. Throws a message a person can act on. */
export function checkFile(kind: UploadKind, data: Buffer): Checked {
  if (data.length === 0) throw new FileError("The file is empty.");
  if (data.length > LIMITS[kind]) throw new FileError(`The file is too big: the limit is ${LIMITS[kind] / MB} MB.`);
  if (kind === "logo") {
    // Covers and reel closings draw public/logo.png, so a logo is a PNG.
    if (isPng(data)) return { ext: "png", mime: "image/png" };
    throw new FileError("The logo must be a PNG.");
  }
  if (kind === "sheet") {
    if (isPng(data)) return { ext: "png", mime: "image/png" };
    if (isJpeg(data)) return { ext: "jpg", mime: "image/jpeg" };
    throw new FileError("The reference sheet must be a PNG or a JPG.");
  }
  if (kind === "voice") {
    if (isWav(data)) return { ext: "wav", mime: "audio/wav" };
    throw new FileError("The voice sample must be a WAV file.");
  }
  if (isZip(data)) return { ext: "zip", mime: "application/zip" };
  throw new FileError("That is not a zip file.");
}
