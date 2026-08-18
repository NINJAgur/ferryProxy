import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { ThreadMessage } from "./thread";

interface ThreadState {
  messages: ThreadMessage[];
  append: (message: ThreadMessage) => void;
  patch: (id: string, patch: Partial<ThreadMessage>) => void;
  replaceAll: (messages: ThreadMessage[]) => void;
  clear: () => void;
}

/** The conversation survives closing the app — losing it would undo the whole
 *  point of queueing work on a bad line. */
export const useThreadStore = create<ThreadState>()(
  persist(
    (set) => ({
      messages: [],
      append: (message) => set((s) => ({ messages: [...s.messages, message] })),
      patch: (id, patch) =>
        set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
      replaceAll: (messages) => set({ messages }),
      clear: () => set({ messages: [] }),
    }),
    {
      name: "ferry.thread.v1",
      storage: createJSONStorage(() => AsyncStorage),
      // A message caught mid-flight when the app closed is no longer in flight.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.replaceAll(
          state.messages.map((m) => (m.status === "sending" ? { ...m, status: "queued" as const } : m))
        );
      },
    }
  )
);
