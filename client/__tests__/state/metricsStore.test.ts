import {
  averageAnswerBytes,
  computeSessionTotals,
  groupByConversation,
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

describe("grouping the Data screen by chat", () => {
  const metric = (id: string, conversationId?: string, title?: string) => ({
    id,
    timestamp: Number(id),
    prompt: `prompt ${id}`,
    conversationId,
    conversationTitle: title,
    rawPromptBytes: 10,
    rawResponseBytes: 100,
    compressedBytesSent: 20,
    compressedBytesReceived: 30,
    totalChunks: 1,
    chunkRetries: 0,
    totalLatencyMs: 500,
    timeToFirstChunkMs: 200,
    brief: true,
  });

  test("each chat carries its own total", () => {
    const groups = groupByConversation([metric("2", "a"), metric("1", "a")]);

    expect(groups).toHaveLength(1);
    expect(groups[0].messages).toHaveLength(2);
    expect(groups[0].answerBytes).toBe(200);
    expect(groups[0].totals.compressedBytes).toBe(100);
  });

  test("chats are separate, most recent first", () => {
    const groups = groupByConversation([metric("5", "new"), metric("1", "old")]);

    expect(groups.map((g) => g.id)).toEqual(["new", "old"]);
  });

  test("a chat is named by its title, falling back to what was asked", () => {
    expect(groupByConversation([metric("1", "a", "Cooking recipe")])[0].title).toBe("Cooking recipe");
    expect(groupByConversation([metric("1", "a")])[0].title).toBe("prompt 1");
  });

  test("answers measured before chats were recorded still have a home", () => {
    // Otherwise upgrading the app would silently drop everything already there.
    const groups = groupByConversation([metric("1")]);

    expect(groups[0].title).toBe("Earlier chats");
  });
});
