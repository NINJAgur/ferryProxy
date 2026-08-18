jest.mock("../../src/transport/ids", () => {
  let counter = 0;
  return { generateId: jest.fn(() => `fixed-id-${counter++}`) };
});

import AsyncStorage from "@react-native-async-storage/async-storage";

import { enqueue, incrementAttempts, loadQueue, markFailed, removeMessage } from "../../src/queue/offlineQueue";

describe("offlineQueue", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("starts empty", async () => {
    expect(await loadQueue()).toEqual([]);
  });

  it("enqueue persists a pending message", async () => {
    const message = await enqueue({ prompt: "hello" });
    expect(message.status).toBe("pending");
    expect(message.attempts).toBe(0);

    const queue = await loadQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].prompt).toBe("hello");
  });

  it("removeMessage deletes only the matching entry", async () => {
    const a = await enqueue({ prompt: "a" });
    await enqueue({ prompt: "b" });

    await removeMessage(a.id);

    const queue = await loadQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].prompt).toBe("b");
  });

  it("markFailed flips status and records attempts without removing the item", async () => {
    const message = await enqueue({ prompt: "will fail" });

    await markFailed(message.id, 3);

    const queue = await loadQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe("failed");
    expect(queue[0].attempts).toBe(3);
  });

  it("incrementAttempts bumps the attempt counter", async () => {
    const message = await enqueue({ prompt: "retry me" });

    await incrementAttempts(message.id);
    await incrementAttempts(message.id);

    const queue = await loadQueue();
    expect(queue[0].attempts).toBe(2);
  });
});
