import AsyncStorage from "@react-native-async-storage/async-storage";

import { useThreadStore } from "../../src/state/threadStore";

const STORAGE_KEY = "ferry.thread.v1";

beforeEach(async () => {
  await AsyncStorage.clear();
  useThreadStore.setState({ messages: [] });
});

describe("threadStore", () => {
  it("appends and patches messages", () => {
    const store = useThreadStore.getState();
    store.append({ id: "a", role: "user", content: "hi", timestamp: 1, status: "sending" });
    useThreadStore.getState().patch("a", { status: "delivered" });

    const messages = useThreadStore.getState().messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe("delivered");
  });

  it("writes the thread to device storage so it survives a restart", async () => {
    useThreadStore.getState().append({
      id: "a",
      role: "assistant",
      content: "kept",
      timestamp: 1,
      status: "delivered",
    });

    // zustand/persist flushes asynchronously.
    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(raw).toContain("kept");
  });

  it("clear empties the thread", () => {
    useThreadStore.getState().append({ id: "a", role: "user", content: "x", timestamp: 1, status: "delivered" });
    useThreadStore.getState().clear();
    expect(useThreadStore.getState().messages).toEqual([]);
  });
});
