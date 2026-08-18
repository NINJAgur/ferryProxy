import NetInfo from "@react-native-community/netinfo";

import { HttpError } from "../transport/httpClient";
import { sendPrompt } from "../transport/reassembly";
import { loadQueue, markFailed, QueuedMessage, removeMessage } from "./offlineQueue";

export interface QueueProcessorDeps {
  sessionId: string;
  onMessageComplete?: (message: QueuedMessage, content: string) => void;
  onMessageFailed?: (message: QueuedMessage, reason: string) => void;
}

let draining = false;

export async function drainQueue(deps: QueueProcessorDeps): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const queue = await loadQueue();
    for (const message of queue.filter((m) => m.status === "pending")) {
      try {
        const result = await sendPrompt(
          {
            prompt: message.prompt,
            history: message.history,
            provider: message.provider,
            model: message.model,
            maxTokens: message.maxTokens,
            sessionId: deps.sessionId,
          },
          () => {
            // Individual queue items don't drive UI state directly; the caller can
            // observe completion/failure via onMessageComplete / onMessageFailed.
          }
        );
        await removeMessage(message.id);
        deps.onMessageComplete?.(message, result.response.content);
      } catch (err) {
        if (!(err instanceof HttpError)) {
          // We never got a response at all (still offline) — stop and wait for the
          // next online event rather than marking every remaining item failed.
          return;
        }
        await markFailed(message.id, message.attempts + 1);
        deps.onMessageFailed?.(message, String(err));
      }
    }
  } finally {
    draining = false;
  }
}

export function startQueueProcessor(deps: QueueProcessorDeps, autoSendOnReconnect = true): () => void {
  void drainQueue(deps);
  if (!autoSendOnReconnect) {
    return () => {};
  }
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      void drainQueue(deps);
    }
  });
}
