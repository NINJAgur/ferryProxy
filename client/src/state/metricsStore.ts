import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { SendPromptMetrics } from "../transport/reassembly";

export interface MessageMetrics extends SendPromptMetrics {
  id: string;
  timestamp: number;
  prompt: string;
  /** Which chat this went out in. Absent on anything measured before the Data
   *  screen grouped by chat, which is why the screen has a bucket for those. */
  conversationId?: string;
  conversationTitle?: string;
}

interface MetricsState {
  messages: MessageMetrics[];
  addMessage: (message: MessageMetrics) => void;
  clear: () => void;
}

/** Kept on the device: the Data screen should still be there after a restart. */
export const useMetricsStore = create<MetricsState>()(
  persist(
    (set) => ({
      messages: [],
      addMessage: (message) => set((state) => ({ messages: [message, ...state.messages] })),
      clear: () => set({ messages: [] }),
    }),
    { name: "ferry.metrics.v1", storage: createJSONStorage(() => AsyncStorage) }
  )
);

export interface SessionTotals {
  rawBytes: number;
  compressedBytes: number;
  totalChunks: number;
  chunkRetries: number;
  compressionRatio: number;
}

export interface BrevityComparison {
  briefCount: number;
  fullCount: number;
  briefAvgBytes: number;
  fullAvgBytes: number;
  /** Fraction of the answer avoided by asking for a short one. */
  saved: number;
}

/** The average answer size, whatever kind of answers these are.
 *
 *  Always available once anything has arrived, unlike the brevity comparison,
 *  which needs a full-length answer it may never see. */
export function averageAnswerBytes(messages: MessageMetrics[]): number | null {
  if (messages.length === 0) return null;
  return messages.reduce((a, m) => a + m.rawResponseBytes, 0) / messages.length;
}

/** What brevity is worth, measured from this device's own answers rather than
 *  assumed. Returns null until there is at least one of each to compare, because
 *  a saving quoted from one sample would be a guess dressed up as a number. */
export function computeBrevityComparison(messages: MessageMetrics[]): BrevityComparison | null {
  const brief = messages.filter((m) => m.brief);
  const full = messages.filter((m) => !m.brief);
  if (brief.length === 0 || full.length === 0) return null;

  const avg = (xs: MessageMetrics[]) =>
    xs.reduce((a, m) => a + m.rawResponseBytes, 0) / xs.length;
  const briefAvgBytes = avg(brief);
  const fullAvgBytes = avg(full);
  return {
    briefCount: brief.length,
    fullCount: full.length,
    briefAvgBytes,
    fullAvgBytes,
    saved: fullAvgBytes > 0 ? 1 - briefAvgBytes / fullAvgBytes : 0,
  };
}

export function computeSessionTotals(messages: MessageMetrics[]): SessionTotals {
  const totals = messages.reduce(
    (acc, m) => ({
      rawBytes: acc.rawBytes + m.rawPromptBytes + m.rawResponseBytes,
      compressedBytes: acc.compressedBytes + m.compressedBytesSent + m.compressedBytesReceived,
      totalChunks: acc.totalChunks + m.totalChunks,
      chunkRetries: acc.chunkRetries + m.chunkRetries,
    }),
    { rawBytes: 0, compressedBytes: 0, totalChunks: 0, chunkRetries: 0 }
  );
  return {
    ...totals,
    compressionRatio: totals.rawBytes > 0 ? totals.compressedBytes / totals.rawBytes : 0,
  };
}

export interface ConversationMetrics {
  id: string;
  title: string;
  messages: MessageMetrics[];
  totals: SessionTotals;
  answerBytes: number;
  latestAt: number;
}

/**
 * The Data screen answers "what did this cost me", and a message on its own is
 * not the unit anyone thinks in — a conversation is. Each chat carries its own
 * total, and the messages sit under the one they belong to.
 */
export function groupByConversation(messages: MessageMetrics[]): ConversationMetrics[] {
  const groups = new Map<string, MessageMetrics[]>();
  for (const message of messages) {
    const key = message.conversationId ?? "";
    const existing = groups.get(key);
    if (existing) existing.push(message);
    else groups.set(key, [message]);
  }

  return [...groups.entries()]
    .map(([id, group]) => ({
      id: id || "earlier",
      title: id
        ? group.find((m) => m.conversationTitle)?.conversationTitle ?? group[group.length - 1].prompt
        : "Earlier chats",
      messages: group,
      totals: computeSessionTotals(group),
      answerBytes: group.reduce((a, m) => a + m.rawResponseBytes, 0),
      latestAt: Math.max(...group.map((m) => m.timestamp)),
    }))
    .sort((a, b) => b.latestAt - a.latestAt);
}
