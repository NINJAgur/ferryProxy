import {
  averageAnswerBytes,
  computeSessionTotals,
  MessageMetrics,
} from "../../src/state/metricsStore";

function makeMessage(overrides: Partial<MessageMetrics> = {}): MessageMetrics {
  return {
    id: "1",
    timestamp: Date.now(),
    prompt: "hi",
    brief: false,
    rawPromptBytes: 100,
    rawResponseBytes: 400,
    compressedBytesSent: 40,
    compressedBytesReceived: 120,
    totalChunks: 2,
    chunkRetries: 1,
    timeToFirstChunkMs: 50,
    totalLatencyMs: 200,
    ...overrides,
  };
}

describe("computeSessionTotals", () => {
  it("returns zeroed totals for an empty message list", () => {
    expect(computeSessionTotals([])).toEqual({
      rawBytes: 0,
      compressedBytes: 0,
      totalChunks: 0,
      chunkRetries: 0,
      compressionRatio: 0,
    });
  });

  it("sums bytes/chunks/retries and computes the compression ratio", () => {
    const totals = computeSessionTotals([makeMessage(), makeMessage({ id: "2" })]);

    expect(totals.rawBytes).toBe((100 + 400) * 2);
    expect(totals.compressedBytes).toBe((40 + 120) * 2);
    expect(totals.totalChunks).toBe(4);
    expect(totals.chunkRetries).toBe(2);
    expect(totals.compressionRatio).toBeCloseTo(totals.compressedBytes / totals.rawBytes);
  });
});

describe("averageAnswerBytes", () => {
  it("has nothing to report before anything has arrived", () => {
    // The card falls back to this, so null has to mean "no data" and not zero —
    // "0 B per answer" would be a measurement, and a wrong one.
    expect(averageAnswerBytes([])).toBeNull();
  });

  it("averages the answers it has, brief or not", () => {
    const messages = [
      makeMessage({ id: "a", brief: true, rawResponseBytes: 300 }),
      makeMessage({ id: "b", brief: true, rawResponseBytes: 500 }),
    ];

    // Available even when every answer was asked short, which is the case the
    // brevity comparison can never report on.
    expect(averageAnswerBytes(messages)).toBe(400);
  });
});
