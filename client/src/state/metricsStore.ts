import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { SendPromptMetrics } from "../transport/reassembly";

export interface MessageMetrics extends SendPromptMetrics {
  id: string;
  timestamp: number;
  prompt: string;
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
