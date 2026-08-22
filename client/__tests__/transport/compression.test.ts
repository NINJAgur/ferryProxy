import {
  ALGORITHM_DICT,
  ALGORITHM_NONE,
  compressWithDictionary,
  decodePayload,
  decompressWithDictionary,
  encodePayload,
} from "../../src/transport/compression";
import { DICTIONARY_SHA256 } from "../../src/transport/dictionary";

const request = JSON.stringify({
  prompt: "hi",
  model: "claude-opus-5",
  history: [],
  brief: true,
});

test("the dictionary beats sending plainly where gzip cannot", () => {
  // gzip's header costs more than it saves on a short payload, so below a few
  // hundred bytes compressing used to make messages bigger.
  const { algorithm, payload } = encodePayload(request);

  expect(algorithm).toBe(ALGORITHM_DICT);
  expect(payload.length).toBeLessThan(request.length);
});

test("a dictionary payload round trips", () => {
  const conversation = "a conversation, several turns of it, ".repeat(20);

  expect(decompressWithDictionary(compressWithDictionary(conversation))).toBe(conversation);
});

test("the relay's dictionary answer is readable", () => {
  const answer = JSON.stringify({ content: "the answer", model: "claude-opus-5" });

  expect(decodePayload(ALGORITHM_DICT, compressWithDictionary(answer))).toBe(answer);
});

test("an encoding nobody recognises is refused rather than guessed at", () => {
  expect(() => decodePayload("brotli", "anything")).toThrow(/unknown algorithm/);
});

test("plain text still wins when nothing can be saved", () => {
  // Random-ish content with nothing in the dictionary to match and no repeats.
  const noise = "q7z";

  expect(encodePayload(noise).algorithm).toBe(ALGORITHM_NONE);
});

test("the dictionary has not drifted from the relay's copy", () => {
  // server/app/protocol/dictionary.py pins the same checksum. A dictionary that
  // differs by one byte does not fail, it decompresses to rubbish.
  expect(DICTIONARY_SHA256).toBe(
    "0b0e2f8ba0dd106ea66296f4fb020f07f0e509b54dc8277e82c91b64fe994c15"
  );
});
