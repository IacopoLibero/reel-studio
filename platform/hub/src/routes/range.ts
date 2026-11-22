export interface ByteRange { start: number; end: number }

/**
 * The bytes a `Range: bytes=...` header asks for in a file of `size` bytes. `null` = no usable range header (send the whole file);
 * `"unsatisfiable"` = a range outside the file (answer 416). Only one range is supported, which is all a video player asks for.
 */
export function parseRange(header: string | undefined, size: number): ByteRange | null | "unsatisfiable" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number, end: number;
  if (m[1] === "") { const n = Number(m[2]); if (n === 0) return "unsatisfiable"; start = Math.max(0, size - n); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}
