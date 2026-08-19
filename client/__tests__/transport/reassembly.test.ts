import { ReassemblyStatus } from "../../src/transport/reassemblyState";

jest.mock("../../src/transport/httpClient", () => {
  const actual = jest.requireActual("../../src/transport/httpClient");
  return { ...actual, postChat: jest.fn(), getChunk: jest.fn() };
});
jest.mock("../../src/transport/compression");
jest.mock("../../src/transport/ids");

import { getChunk, HttpError, postChat } from "../../src/transport/httpClient";
import { decodePayload, encodePayload, sha256Hex } from "../../src/transport/compression";
import { generateId } from "../../src/transport/ids";
import {
  CHUNK_FETCH_TIMEOUT_MS,
  isRetryable,
  REASSEMBLY_BUDGET_MS,
  SEND_TIMEOUT_MS,
  sendPrompt,
} from "../../src/transport/reassembly";

const mockPostChat = postChat as jest.MockedFunction<typeof postChat>;
const mockGetChunk = getChunk as jest.MockedFunction<typeof getChunk>;
const mockEncodePayload = encodePayload as jest.MockedFunction<typeof encodePayload>;
const mockDecodePayload = decodePayload as jest.MockedFunction<typeof decodePayload>;
const mockSha256Hex = sha256Hex as jest.MockedFunction<typeof sha256Hex>;
const mockGenerateId = generateId as jest.MockedFunction<typeof generateId>;

const RESPONSE_JSON = JSON.stringify({
  content: "final answer",
  provider: "anthropic",
  model: "claude-opus-5",
  stopReason: "end_turn",
});
const CHECKSUM = "matching-checksum";

function collectStates(): { states: ReassemblyStatus[]; onStateChange: (s: ReassemblyStatus) => void } {
  const states: ReassemblyStatus[] = [];
  return { states, onStateChange: (s) => states.push(s) };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockGenerateId.mockReturnValue("test-request-id");
  mockEncodePayload.mockReturnValue({ algorithm: "gzip", payload: "cGF5bG9hZA==" });
  mockDecodePayload.mockReturnValue(RESPONSE_JSON);
  mockSha256Hex.mockResolvedValue(CHECKSUM);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("sendPrompt", () => {
  it("resolves immediately when the response fits in a single chunk", async () => {
    mockPostChat.mockResolvedValue({
      r: "test-request-id",
      a: "gzip",
      k: CHECKSUM,
      n: 1,
      c: "onlychunk",
      t: 300,
    });

    const { states, onStateChange } = collectStates();
    const result = await sendPrompt({ prompt: "hi", sessionId: "s1" }, onStateChange);

    expect(result.response.content).toBe("final answer");
    expect(result.metrics.totalChunks).toBe(1);
    expect(result.metrics.chunkRetries).toBe(0);
    expect(states[0]).toEqual({ status: "sending" });
    expect(states[states.length - 1]).toEqual({ status: "complete", content: "final answer" });
    expect(mockGetChunk).not.toHaveBeenCalled();
  });

  it("fetches remaining chunks and recovers from a transient chunk failure", async () => {
    mockPostChat.mockResolvedValue({
      r: "test-request-id",
      a: "gzip",
      k: CHECKSUM,
      n: 3,
      c: "chunk0",
      t: 300,
    });

    let chunk1Attempts = 0;
    mockGetChunk.mockImplementation(async (_requestId, index) => {
      if (index === 1) {
        chunk1Attempts += 1;
        if (chunk1Attempts === 1) {
          throw new Error("simulated chunk fetch failure");
        }
        return { i: 1, n: 3, c: "chunk1" };
      }
      return { i: index, n: 3, c: `chunk${index}` };
    });

    const { states, onStateChange } = collectStates();
    const promise = sendPrompt({ prompt: "hi", sessionId: "s1" }, onStateChange);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.metrics.totalChunks).toBe(3);
    expect(result.metrics.chunkRetries).toBe(1);
    expect(chunk1Attempts).toBe(2);
    expect(states.some((s) => s.status === "retrying")).toBe(true);
    expect(states[states.length - 1]).toEqual({ status: "complete", content: "final answer" });
  });

  it("fails after exhausting send retries", async () => {
    mockPostChat.mockRejectedValue(new Error("simulated send failure"));

    const { states, onStateChange } = collectStates();
    const promise = sendPrompt({ prompt: "hi", sessionId: "s1" }, onStateChange);
    const assertion = expect(promise).rejects.toThrow();
    await jest.runAllTimersAsync();
    await assertion;
    expect(states[states.length - 1].status).toBe("failed");
  });

  it("fails when the reassembled checksum does not match", async () => {
    mockPostChat.mockResolvedValue({
      r: "test-request-id",
      a: "gzip",
      k: "server-checksum",
      n: 1,
      c: "onlychunk",
      t: 300,
    });
    mockSha256Hex.mockResolvedValue("different-checksum");

    const { onStateChange } = collectStates();
    await expect(sendPrompt({ prompt: "hi", sessionId: "s1" }, onStateChange)).rejects.toThrow(
      /checksum mismatch/
    );
  });
});

describe("isRetryable", () => {
  it("retries when no response arrived at all (network drop / timeout)", () => {
    expect(isRetryable(new Error("Network request failed"))).toBe(true);
  });

  it("does not retry a deterministic 503 provider-not-configured", () => {
    expect(isRetryable(new HttpError(503, { error: "provider_not_configured", message: "no key" }))).toBe(false);
  });

  it("does not retry 4xx or an expired chunk cache", () => {
    expect(isRetryable(new HttpError(400, undefined))).toBe(false);
    expect(isRetryable(new HttpError(404, undefined))).toBe(false);
  });

  it("retries transient upstream failures", () => {
    expect(isRetryable(new HttpError(502, undefined))).toBe(true);
    expect(isRetryable(new HttpError(504, undefined))).toBe(true);
  });
});

describe("timeouts", () => {
  it("waits far longer for the model than for a cached chunk", () => {
    // The opening POST blocks on the whole generation; a chunk fetch is a cached
    // slice. Sharing one 8s value made every real send time out and retry.
    expect(SEND_TIMEOUT_MS).toBeGreaterThan(CHUNK_FETCH_TIMEOUT_MS);
    expect(SEND_TIMEOUT_MS).toBeGreaterThanOrEqual(30000);
  });

  it("gives the whole exchange more room than a single send", () => {
    expect(REASSEMBLY_BUDGET_MS).toBeGreaterThan(SEND_TIMEOUT_MS);
  });
});
