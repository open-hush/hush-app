/**
 * Base64 ↔ bytes helpers. `react-native-ble-plx` exchanges every
 * characteristic value as a Base64 string, but the Improv protocol is binary
 * (single-byte states, framed RPC packets). These convert at that boundary.
 *
 * Implemented by hand rather than via `Buffer` (absent in React Native) or
 * `atob`/`btoa` (latin1-only and not guaranteed across engines), so the
 * conversion is dependency-free and host-testable.
 */

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const LOOKUP: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i += 1) {
  LOOKUP[ALPHABET[i]] = i;
}

/** Encode raw bytes to a standard (padded) Base64 string. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;

    out += ALPHABET[b0 >> 2];
    out += ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < bytes.length ? ALPHABET[b2 & 0x3f] : "=";
  }
  return out;
}

/** Decode a Base64 string (padded or not) to raw bytes. */
export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, "");
  const len = clean.length;
  // Each 4 base64 chars → 3 bytes; a trailing group of 2/3 chars → 1/2 bytes.
  const fullGroups = Math.floor(len / 4);
  const remainder = len % 4;
  const byteLen =
    fullGroups * 3 + (remainder === 2 ? 1 : remainder === 3 ? 2 : 0);
  const out = new Uint8Array(byteLen);

  let outIdx = 0;
  let i = 0;
  for (; i + 4 <= len; i += 4) {
    const n =
      (LOOKUP[clean[i]] << 18) |
      (LOOKUP[clean[i + 1]] << 12) |
      (LOOKUP[clean[i + 2]] << 6) |
      LOOKUP[clean[i + 3]];
    out[outIdx++] = (n >> 16) & 0xff;
    out[outIdx++] = (n >> 8) & 0xff;
    out[outIdx++] = n & 0xff;
  }
  if (remainder === 2) {
    const n = (LOOKUP[clean[i]] << 18) | (LOOKUP[clean[i + 1]] << 12);
    out[outIdx++] = (n >> 16) & 0xff;
  } else if (remainder === 3) {
    const n =
      (LOOKUP[clean[i]] << 18) |
      (LOOKUP[clean[i + 1]] << 12) |
      (LOOKUP[clean[i + 2]] << 6);
    out[outIdx++] = (n >> 16) & 0xff;
    out[outIdx++] = (n >> 8) & 0xff;
  }
  return out;
}
