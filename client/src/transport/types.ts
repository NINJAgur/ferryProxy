export type Provider = "anthropic" | "openai" | "gemini";
export type Algorithm = "gzip" | "none";

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequestPlaintext {
  prompt: string;
  history?: HistoryMessage[];
  model?: string;
  maxTokens?: number;
  /** Ask the model for a short answer. Not the same as capping tokens: models that
   *  think before answering spend a low cap on reasoning and get cut off mid-sentence. */
  brief?: boolean;
}

/** Wire envelopes use single-letter names — see PROTOCOL.md. They repeat on
 *  every message, so the field names themselves are bandwidth. */
export interface ChatRequestEnvelope {
  r: string; // requestId
  a: Algorithm; // algorithm
  k: string; // checksum
  p: string; // payload
}

export interface ChatResponsePlaintext {
  content: string;
  provider: Provider;
  model: string;
  stopReason: string;
}

export interface ChatResponseEnvelope {
  r: string; // requestId
  a: Algorithm; // algorithm
  k: string; // checksum
  n: number; // totalChunks
  c: string; // chunk 0
  t: number; // ttlSeconds
}

/** Terse by design — this envelope repeats on every piece of every answer. */
export interface ChunkResponse {
  i: number;
  n: number;
  c: string;
}

export interface ErrorEnvelope {
  error: string;
  message: string;
}

/** A model the caller may or may not use. Mirrors the relay's catalogue, and
 *  says nothing about keys — the relay holds those. */
export interface ModelInfo {
  id: string;
  label: string;
  provider: Provider;
  tier: "free" | "paid";
  blurb: string;
  unlocked: boolean;
  reason: "free" | "subscribed" | "needs_subscription" | "unavailable";
}

/** What this device may use. There is no account — only whether the add-on was
 *  bought, and how many of the answers it included are left. */
export interface EntitlementInfo {
  unlocked: boolean;
  answersUsed: number;
  answersAllowed: number;
  /** Owns the add-on but has spent its answers; the free model carries on. */
  capped: boolean;
  models: ModelInfo[];
}

