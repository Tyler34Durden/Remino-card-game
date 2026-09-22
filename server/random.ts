/*
 * Random numbers from the Web Crypto API, which both Node and browsers provide.
 * The solo build runs this same room manager inside the page, so it must not depend on Node.
 */

/** A whole number in [min, max). Rejection sampling keeps every value equally likely. */
export function randomInt(min: number, max: number): number {
  const range = max - min;
  if (!Number.isInteger(range) || range <= 0) throw new RangeError("randomInt needs a positive integer range.");
  // The largest multiple of range that fits in 2^32, so the tail that would bias the result is discarded.
  const limit = Math.floor(0x100000000 / range) * range;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return min + (value % range);
}

/** Random bytes with a `toString("base64url")` shaped like the Node Buffer this replaces. */
export function randomBytes(size: number): { toString: (encoding: "base64url") => string } {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return {
    toString: () => {
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },
  };
}
