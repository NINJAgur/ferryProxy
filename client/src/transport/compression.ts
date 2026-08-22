import * as base64 from "base64-js";
import * as Crypto from "expo-crypto";
import * as pako from "pako";

import { SHARED_DICTIONARY } from "./dictionary";

export const ALGORITHM_GZIP = "gzip";
export const ALGORITHM_NONE = "none";
/** Raw deflate against a dictionary both ends hold. No header to amortise and a
 *  body of text to match against, so it wins where the other two cannot. */
export const ALGORITHM_DICT = "zd";

/** Truncated to match the server: 64 bits is plenty to catch mangled or
 *  mis-ordered chunks, and the full digest cost 48 bytes per envelope. */
export const CHECKSUM_HEX_LEN = 16;

export function compressToBase64(plaintext: string): string {
  return base64.fromByteArray(pako.gzip(new TextEncoder().encode(plaintext)));
}

export function decompressFromBase64(encoded: string): string {
  return new TextDecoder().decode(pako.ungzip(base64.toByteArray(encoded)));
}

export function compressWithDictionary(plaintext: string): string {
  return base64.fromByteArray(
    pako.deflateRaw(new TextEncoder().encode(plaintext), { dictionary: SHARED_DICTIONARY, level: 9 })
  );
}

export function decompressWithDictionary(encoded: string): string {
  return new TextDecoder().decode(
    pako.inflateRaw(base64.toByteArray(encoded), { dictionary: SHARED_DICTIONARY })
  );
}

/** Encoding must never make a payload bigger: compressing a short prompt adds a
 *  gzip header and then a third again for base64. Send whichever is smaller. */
export function encodePayload(plaintext: string): { algorithm: string; payload: string } {
  const candidates = [
    { algorithm: ALGORITHM_NONE, payload: plaintext },
    { algorithm: ALGORITHM_GZIP, payload: compressToBase64(plaintext) },
    { algorithm: ALGORITHM_DICT, payload: compressWithDictionary(plaintext) },
  ];
  return candidates.reduce((best, next) => (next.payload.length < best.payload.length ? next : best));
}

export function decodePayload(algorithm: string, payload: string): string {
  if (algorithm === ALGORITHM_GZIP) return decompressFromBase64(payload);
  if (algorithm === ALGORITHM_DICT) return decompressWithDictionary(payload);
  if (algorithm === ALGORITHM_NONE) return payload;
  throw new Error(`unknown algorithm: ${algorithm}`);
}

export async function sha256Hex(plaintext: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, plaintext);
  return digest.slice(0, CHECKSUM_HEX_LEN);
}
