import { ThreadMessage } from "./thread";
import { HistoryMessage } from "../transport/types";

/**
 * What of the conversation travels with the next question.
 *
 * The relay keeps no conversation of its own, so a model only knows what this
 * message carries. Sending nothing is what made every question read as the first
 * one ever asked.
 *
 * Sending everything is wrong too, and for Ferry more than most apps: the whole
 * chat would go back over the line on every message, and the providers bill each
 * of those tokens again. So the recent end of the conversation travels and the
 * rest is dropped, oldest first.
 */
export const HISTORY_MAX_MESSAGES = 12;
export const HISTORY_MAX_CHARS = 6000;

export function historyFor(messages: ThreadMessage[]): HistoryMessage[] {
  // A question that never arrived, or an answer that never came back, is not
  // part of the conversation the model had.
  const settled = messages.filter(
    (m) => m.status === "delivered" && m.content.trim().length > 0
  );

  const kept: HistoryMessage[] = [];
  let chars = 0;
  for (const message of settled.slice(-HISTORY_MAX_MESSAGES).reverse()) {
    chars += message.content.length;
    if (chars > HISTORY_MAX_CHARS && kept.length > 0) break;
    kept.unshift({ role: message.role, content: message.content });
  }
  return kept;
}
