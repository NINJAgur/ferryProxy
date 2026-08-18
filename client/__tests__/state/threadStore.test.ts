import AsyncStorage from "@react-native-async-storage/async-storage";

import { useThreadStore } from "../../src/state/threadStore";

const STORAGE_KEY = "ferry.chats.v1";

beforeEach(async () => {
  await AsyncStorage.clear();
  useThreadStore.setState({ conversations: [], activeId: null });
});

function msg(id: string, content: string, role: "user" | "assistant" = "user") {
  return { id, role, content, timestamp: 1, status: "delivered" as const };
}

describe("threadStore", () => {
  it("startNew opens a chat and makes it active", () => {
    useThreadStore.getState().startNew("c1");
    const s = useThreadStore.getState();
    expect(s.activeId).toBe("c1");
    expect(s.conversations).toHaveLength(1);
  });

  it("titles a chat from its first question", () => {
    useThreadStore.getState().startNew("c1");
    useThreadStore.getState().append(msg("m1", "Is a 9% rent rise normal?"));
    expect(useThreadStore.getState().conversations[0].title).toBe("Is a 9% rent rise normal?");
  });

  it("keeps the title once set, rather than renaming on every message", () => {
    useThreadStore.getState().startNew("c1");
    useThreadStore.getState().append(msg("m1", "First question"));
    useThreadStore.getState().append(msg("m2", "Second question"));
    expect(useThreadStore.getState().conversations[0].title).toBe("First question");
  });

  it("keeps chats separate", () => {
    const store = useThreadStore.getState();
    store.startNew("c1");
    useThreadStore.getState().append(msg("m1", "in chat one"));
    useThreadStore.getState().startNew("c2");
    useThreadStore.getState().append(msg("m2", "in chat two"));

    const byId = Object.fromEntries(useThreadStore.getState().conversations.map((c) => [c.id, c]));
    expect(byId.c1.messages.map((m) => m.content)).toEqual(["in chat one"]);
    expect(byId.c2.messages.map((m) => m.content)).toEqual(["in chat two"]);
  });

  it("patch only touches the open chat", () => {
    useThreadStore.getState().startNew("c1");
    useThreadStore.getState().append(msg("m1", "hi"));
    useThreadStore.getState().patch("m1", { status: "failed" });
    expect(useThreadStore.getState().conversations[0].messages[0].status).toBe("failed");
  });

  it("remove deletes a chat and clears it if it was open", () => {
    useThreadStore.getState().startNew("c1");
    useThreadStore.getState().remove("c1");
    expect(useThreadStore.getState().conversations).toHaveLength(0);
    expect(useThreadStore.getState().activeId).toBeNull();
  });

  it("writes chats to device storage so they survive a restart", async () => {
    useThreadStore.getState().startNew("c1");
    useThreadStore.getState().append(msg("m1", "kept across restarts"));

    await new Promise((r) => setTimeout(r, 0));
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    expect(raw).toContain("kept across restarts");
  });
});
