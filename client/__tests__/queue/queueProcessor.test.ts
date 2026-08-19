jest.mock("../../src/transport/ids", () => {
  let counter = 0;
  return { generateId: jest.fn(() => `fixed-id-${counter++}`) };
});
jest.mock("../../src/transport/reassembly");

import AsyncStorage from "@react-native-async-storage/async-storage";

import { HttpError } from "../../src/transport/httpClient";
import { sendPrompt } from "../../src/transport/reassembly";
import { enqueue, loadQueue } from "../../src/queue/offlineQueue";
import { drainQueue } from "../../src/queue/queueProcessor";

const mockSendPrompt = sendPrompt as jest.MockedFunction<typeof sendPrompt>;

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe("drainQueue", () => {
  it("sends every pending message and removes each on success", async () => {
    await enqueue({ prompt: "a" });
    await enqueue({ prompt: "b" });
    mockSendPrompt.mockResolvedValue({
      response: { content: "ok", provider: "anthropic", model: "m", stopReason: "end_turn" },
      metrics: {
        brief: false,
        rawPromptBytes: 10,
        rawResponseBytes: 10,
        compressedBytesSent: 10,
        compressedBytesReceived: 10,
        totalChunks: 1,
        chunkRetries: 0,
        timeToFirstChunkMs: 5,
        totalLatencyMs: 5,
      },
    });

    await drainQueue({ sessionId: "s1" });

    expect(mockSendPrompt).toHaveBeenCalledTimes(2);
    expect(await loadQueue()).toEqual([]);
  });

  it("marks a non-network failure as failed but keeps draining the rest", async () => {
    await enqueue({ prompt: "will fail" });
    await enqueue({ prompt: "will succeed" });

    mockSendPrompt
      .mockRejectedValueOnce(new HttpError(503, { error: "provider_not_configured", message: "no key" }))
      .mockResolvedValueOnce({
        response: { content: "ok", provider: "anthropic", model: "m", stopReason: "end_turn" },
        metrics: {
          brief: false,
        rawPromptBytes: 10,
          rawResponseBytes: 10,
          compressedBytesSent: 10,
          compressedBytesReceived: 10,
          totalChunks: 1,
          chunkRetries: 0,
          timeToFirstChunkMs: 5,
          totalLatencyMs: 5,
        },
      });

    await drainQueue({ sessionId: "s1" });

    const queue = await loadQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].prompt).toBe("will fail");
    expect(queue[0].status).toBe("failed");
    expect(queue[0].attempts).toBe(1);
  });

  it("stops draining on a network-level failure and leaves remaining items pending", async () => {
    await enqueue({ prompt: "first" });
    await enqueue({ prompt: "second" });

    mockSendPrompt.mockRejectedValue(new TypeError("Network request failed"));

    await drainQueue({ sessionId: "s1" });

    expect(mockSendPrompt).toHaveBeenCalledTimes(1);
    const queue = await loadQueue();
    expect(queue).toHaveLength(2);
    expect(queue.every((m) => m.status === "pending")).toBe(true);
  });
});
