import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { createFileStorage } from "./fileStorage";

import { ThreadMessage } from "./thread";

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ThreadMessage[];
}

interface ThreadState {
  conversations: Conversation[];
  activeId: string | null;
  startNew: (id: string) => void;
  open: (id: string) => void;
  remove: (id: string) => void;
  append: (message: ThreadMessage) => void;
  patch: (id: string, patch: Partial<ThreadMessage>) => void;
  clearAll: () => void;
}

/** First line of the opening question, which is what makes a chat recognisable
 *  in a list — better than a generated name nobody asked for. */
function titleFrom(message: ThreadMessage): string {
  const line = message.content.trim().split("\n")[0];
  return line.length > 60 ? `${line.slice(0, 57)}…` : line || "New chat";
}

function upsertActive(
  state: ThreadState,
  update: (c: Conversation) => Conversation
): Partial<ThreadState> {
  const id = state.activeId;
  if (!id) return {};
  return {
    conversations: state.conversations.map((c) => (c.id === id ? update(c) : c)),
  };
}

export const CHAT_FILE = "ferry-chats.json";

/** Chats live on the device only, in a real file rather than key/value cache:
 *  a conversation is a document, and cache is something the OS may clear.
 *  Nothing is uploaded — the relay keeps no conversation of its own. */
export const useThreadStore = create<ThreadState>()(
  persist(
    (set) => ({
      conversations: [],
      activeId: null,

      startNew: (id) =>
        set((s) => ({
          activeId: id,
          conversations: [
            { id, title: "New chat", createdAt: Date.now(), updatedAt: Date.now(), messages: [] },
            ...s.conversations,
          ],
        })),

      open: (id) => set({ activeId: id }),

      remove: (id) =>
        set((s) => {
          const conversations = s.conversations.filter((c) => c.id !== id);
          return { conversations, activeId: s.activeId === id ? null : s.activeId };
        }),

      append: (message) =>
        set((s) =>
          upsertActive(s, (c) => ({
            ...c,
            updatedAt: Date.now(),
            title:
              c.messages.length === 0 && message.role === "user" ? titleFrom(message) : c.title,
            messages: [...c.messages, message],
          }))
        ),

      patch: (id, patch) =>
        set((s) =>
          upsertActive(s, (c) => ({
            ...c,
            messages: c.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
          }))
        ),

      clearAll: () => set({ conversations: [], activeId: null }),
    }),
    {
      name: "ferry.chats.v1",
      storage: createJSONStorage(() => createFileStorage(CHAT_FILE)),
      // A message caught mid-flight when the app closed is no longer in flight.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.conversations = state.conversations.map((c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.status === "sending" ? { ...m, status: "queued" as const } : m
          ),
        }));
      },
    }
  )
);

export function activeMessages(state: ThreadState): ThreadMessage[] {
  return state.conversations.find((c) => c.id === state.activeId)?.messages ?? [];
}
