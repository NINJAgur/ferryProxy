/**
 * The bytes both ends already know, so they never have to be sent.
 *
 * Deflate encodes a repeat as a short backward reference, which is why it does
 * nothing for a small message: there is no earlier copy of anything to point
 * at, and the header costs more than the encoding saves. A preset dictionary
 * hands the compressor a body of text to point *into* before the message even
 * starts, so the first `{"role":"user","content":"` costs a reference rather
 * than twenty-five bytes.
 *
 * Deflate matches against the END of the dictionary first, so the most valuable
 * strings go last.
 *
 * Both ends must hold this byte for byte. server/app/protocol/dictionary.py is
 * the other copy, and a test on each side pins the same checksum — a dictionary
 * that differs by one byte does not fail, it decompresses to rubbish.
 */
export const SHARED_DICTIONARY_TEXT =
  "the and that have with this from what your you for are was not but they " +
  "answer question please explain short version because there their which " +
  "gemini-3.6-flash gemini-flash-latest gemini-2.5-pro claude-opus-5 " +
  "claude-sonnet-5 claude-haiku-4-5-20251001 gpt-5 gpt-5-mini " +
  '"prompt":"","model":"","history":[],"maxTokens":2048,"brief":true,false' +
  '{"role":"user","content":""},{"role":"assistant","content":""}';

export const SHARED_DICTIONARY = new TextEncoder().encode(SHARED_DICTIONARY_TEXT);

/** Pinned on both sides so the two copies cannot drift apart unnoticed. */
export const DICTIONARY_SHA256 =
  "0b0e2f8ba0dd106ea66296f4fb020f07f0e509b54dc8277e82c91b64fe994c15";
