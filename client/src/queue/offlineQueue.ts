import AsyncStorage from "@react-native-async-storage/async-storage";

import { generateId } from "../transport/ids";
import { HistoryMessage, Provider } from "../transport/types";

const STORAGE_KEY = "proxyai.offline_queue.v1";

export type QueuedMessageStatus = "pending" | "failed";

export interface QueuedMessage {
  id: string;
  prompt: string;
  history: HistoryMessage[];
  provider?: Provider;
  model?: string;
  maxTokens?: number;
  createdAt: number;
  attempts: number;
  status: QueuedMessageStatus;
}

export async function loadQueue(): Promise<QueuedMessage[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedMessage[];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedMessage[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export async function enqueue(input: {
  id?: string;
  prompt: string;
  history?: HistoryMessage[];
  provider?: Provider;
  model?: string;
  maxTokens?: number;
}): Promise<QueuedMessage> {
  const queue = await loadQueue();
  const message: QueuedMessage = {
    id: input.id ?? generateId(),
    prompt: input.prompt,
    history: input.history ?? [],
    provider: input.provider,
    model: input.model,
    maxTokens: input.maxTokens,
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
  };
  queue.push(message);
  await saveQueue(queue);
  return message;
}

export async function removeMessage(id: string): Promise<void> {
  const queue = await loadQueue();
  await saveQueue(queue.filter((m) => m.id !== id));
}

export async function markFailed(id: string, attempts: number): Promise<void> {
  const queue = await loadQueue();
  const updated = queue.map((m) => (m.id === id ? { ...m, status: "failed" as const, attempts } : m));
  await saveQueue(updated);
}

export async function incrementAttempts(id: string): Promise<void> {
  const queue = await loadQueue();
  const updated = queue.map((m) => (m.id === id ? { ...m, attempts: m.attempts + 1 } : m));
  await saveQueue(updated);
}
