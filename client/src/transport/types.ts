export type Provider = "anthropic" | "openai" | "gemini";
export type Algorithm = "gzip" | "none";

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequestPlaintext {
  prompt: string;
  history?: HistoryMessage[];
  provider?: Provider;
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

/** What an account may use. Says nothing about keys — the relay holds those. */
export interface ModelAccess {
  name: Provider;
  label: string;
  unlocked: boolean;
  reason: "included" | "needs_subscription" | "unavailable";
  needsSubscription: boolean;
}

export interface SessionInfo {
  email: string;
  subscribed: boolean;
  models: ModelAccess[];
}

export interface ProviderStatus {
  name: Provider;
  label: string;
  ready: boolean;
  requiresKey: boolean;
  envVar?: string | null;
}
