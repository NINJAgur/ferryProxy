import { computeSessionTotals, MessageMetrics } from "../../src/state/metricsStore";

function makeMessage(overrides: Partial<MessageMetrics> = {}): MessageMetrics {
  return {
    id: "1",
    timestamp: Date.now(),
    prompt: "hi",
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
