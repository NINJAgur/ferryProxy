// The jest moduleNameMapper points this at __mocks__/expo-file-system.js,
// which exposes the in-memory file table the real module has no reason to.
const { __files } = require("expo-file-system") as { __files: Map<string, string> };

import { CHAT_FILE, useThreadStore } from "../../src/state/threadStore";

beforeEach(() => {
  __files.clear();
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

  it("writes chats to a file on the device, not to key/value cache", async () => {
    useThreadStore.getState().startNew("c1");
    useThreadStore.getState().append(msg("m1", "kept across restarts"));

    await new Promise((r) => setTimeout(r, 0));
    const written = Array.from(__files.entries());
    expect(written).toHaveLength(1);
    const [path, contents] = written[0];
    expect(path).toContain(CHAT_FILE);
    expect(contents).toContain("kept across restarts");
  });
});

describe("clearing chats", () => {
  it("empties the file on disk, not just the screen", async () => {
    useThreadStore.getState().startNew("c1");
    useThreadStore.getState().append(msg("m1", "something private"));
    await new Promise((r) => setTimeout(r, 0));
    expect(Array.from(__files.values()).join()).toContain("something private");

    useThreadStore.getState().clearAll();
    await new Promise((r) => setTimeout(r, 0));

    // Deleting must reach the stored copy — clearing only the in-memory list
    // would leave the conversation on the device.
    expect(Array.from(__files.values()).join()).not.toContain("something private");
    expect(useThreadStore.getState().conversations).toEqual([]);
    expect(useThreadStore.getState().activeId).toBeNull();
  });
});
