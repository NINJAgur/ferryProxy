import * as Crypto from "expo-crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
/** 12 base62 chars ≈ 71 bits — far more than enough to keep requests apart for a
 *  300s cache TTL, and 24 bytes shorter than a UUID in every envelope that carries one. */
const ID_LENGTH = 12;

export function generateId(): string {
  const bytes = Crypto.getRandomBytes(ID_LENGTH);
  let out = "";
  for (let i = 0; i < ID_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
