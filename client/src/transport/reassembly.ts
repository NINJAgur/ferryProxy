import { decodePayload, encodePayload, sha256Hex } from "./compression";
import { generateId } from "./ids";
import { getChunk, HttpError, postChat } from "./httpClient";
import {
  initialReassemblyState,
  ReassemblyEvent,
  reassemblyReducer,
  ReassemblyStatus,
} from "./reassemblyState";
import { ChatRequestPlaintext, ChatResponsePlaintext, HistoryMessage, Provider } from "./types";

export const CHUNK_FETCH_TIMEOUT_MS = 8000;
export const CHUNK_RETRY_BASE_DELAY_MS = 500;
export const CHUNK_RETRY_MAX_DELAY_MS = 8000;
export const CHUNK_RETRY_MAX_ATTEMPTS = 5;
export const CHUNK_RETRY_JITTER = 0.2;
export const CHUNK_FETCH_CONCURRENCY = 3;
export const REASSEMBLY_BUDGET_MS = 60000;

export interface SendPromptInput {
  prompt: string;
  history?: HistoryMessage[];
  provider?: Provider;
  model?: string;
  maxTokens?: number;
  brief?: boolean;
  userKey?: string;
  sessionId: string;
}

export interface SendPromptMetrics {
  rawPromptBytes: number;
  rawResponseBytes: number;
  compressedBytesSent: number;
  compressedBytesReceived: number;
  totalChunks: number;
  chunkRetries: number;
  timeToFirstChunkMs: number;
  totalLatencyMs: number;
}

export interface SendPromptResult {
  response: ChatResponsePlaintext;
  metrics: SendPromptMetrics;
}

export function backoffDelay(attempt: number): number {
  const base = Math.min(CHUNK_RETRY_BASE_DELAY_MS * 2 ** attempt, CHUNK_RETRY_MAX_DELAY_MS);
  const jitter = base * CHUNK_RETRY_JITTER;
  return Math.max(0, base + (Math.random() * 2 - 1) * jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function withTimeoutBudget<T>(promise: Promise<T>, budgetMs: number, onTimeout: () => Error): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), budgetMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Retry only what a retry could plausibly fix: a dropped connection or timeout
 *  (no HttpError at all), or a transient upstream failure. A 4xx, a 404 for an
 *  expired chunk cache, or a 503 for an unconfigured provider will fail the same
 *  way every time — retrying them just stalls the UI behind pointless backoff. */
export function isRetryable(err: unknown): boolean {
  if (!(err instanceof HttpError)) return true;
  return err.status === 502 || err.status === 504;
}

async function fetchChunkWithRetry(
  requestId: string,
  index: number,
  onRetry: (attempt: number) => void,
  onBytesReceived: (bytes: number) => void
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < CHUNK_RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await getChunk(requestId, index, CHUNK_FETCH_TIMEOUT_MS);
      onBytesReceived(byteLength(JSON.stringify(response)));
      return response.c;
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) throw err;
      onRetry(attempt);
      await sleep(backoffDelay(attempt));
    }
  }
  throw new Error(`chunk ${index} failed after ${CHUNK_RETRY_MAX_ATTEMPTS} attempts: ${String(lastError)}`);
}

async function fetchRemainingChunks(
  requestId: string,
  totalChunks: number,
  chunk0: string,
  onEvent: (event: ReassemblyEvent) => void,
  onBytesReceived: (bytes: number) => void
): Promise<Map<number, string>> {
  const collected = new Map<number, string>([[0, chunk0]]);
  const indices = Array.from({ length: totalChunks - 1 }, (_, i) => i + 1);

  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < indices.length) {
      const index = indices[cursor];
      cursor += 1;
      const chunk = await fetchChunkWithRetry(
        requestId,
        index,
        (attempt) => {
          onEvent({ type: "CHUNK_FAILED", attempt, totalChunks, receivedCount: collected.size });
        },
        onBytesReceived
      );
      collected.set(index, chunk);
      onEvent({ type: "CHUNK_RECEIVED", totalChunks, receivedCount: collected.size });
    }
  }

  const workerCount = Math.min(CHUNK_FETCH_CONCURRENCY, indices.length || 1);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return collected;
}

export function reassembleBase64(chunks: Map<number, string>, totalChunks: number): string {
  const missing: number[] = [];
  let result = "";
  for (let i = 0; i < totalChunks; i++) {
    const chunk = chunks.get(i);
    if (chunk === undefined) {
      missing.push(i);
    } else {
      result += chunk;
    }
  }
  if (missing.length > 0) {
    throw new Error(`missing chunk indices: ${missing.join(",")}`);
  }
  return result;
}

export async function sendPrompt(
  input: SendPromptInput,
  onStateChange: (state: ReassemblyStatus) => void
): Promise<SendPromptResult> {
  const startTime = Date.now();
  let state: ReassemblyStatus = initialReassemblyState;
  const dispatch = (event: ReassemblyEvent) => {
    state = reassemblyReducer(state, event);
    onStateChange(state);
  };

  dispatch({ type: "SUBMIT" });

  const plaintext: ChatRequestPlaintext = {
    prompt: input.prompt,
    history: input.history,
    provider: input.provider,
    model: input.model,
    maxTokens: input.maxTokens,
    brief: input.brief,
  };
  const raw = JSON.stringify(plaintext);
  const checksum = await sha256Hex(raw);
  const { algorithm, payload } = encodePayload(raw);

  const envelope = {
    r: generateId(),
    a: algorithm as "gzip" | "none",
    k: checksum,
    p: payload,
  };

  const rawPromptBytes = byteLength(raw);
  const compressedBytesSent = byteLength(JSON.stringify(envelope));

  return withTimeoutBudget(
    runRequest(envelope, dispatch, startTime, rawPromptBytes, compressedBytesSent, input.userKey),
    REASSEMBLY_BUDGET_MS,
    () => new Error("reassembly budget exceeded")
  );
}

async function runRequest(
  envelope: Parameters<typeof postChat>[0],
  dispatch: (event: ReassemblyEvent) => void,
  startTime: number,
  rawPromptBytes: number,
  compressedBytesSent: number,
  userKey?: string
): Promise<SendPromptResult> {
  let responseEnvelope: Awaited<ReturnType<typeof postChat>> | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < CHUNK_RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      responseEnvelope = await postChat(envelope, CHUNK_FETCH_TIMEOUT_MS, userKey);
      break;
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) {
        dispatch({ type: "REASSEMBLY_FAILED", reason: String((err as Error).message ?? err) });
        throw err;
      }
      dispatch({ type: "SEND_FAILED", attempt });
      if (attempt < CHUNK_RETRY_MAX_ATTEMPTS - 1) {
        await sleep(backoffDelay(attempt));
      }
    }
  }

  if (!responseEnvelope) {
    dispatch({ type: "REASSEMBLY_FAILED", reason: `send failed: ${String(lastError)}` });
    // Rethrow the original error (not a wrapped one) so callers can distinguish an
    // HttpError (we reached the server) from a network-level failure (we didn't).
    throw lastError instanceof Error
      ? lastError
      : new Error(`POST /v1/chat failed after ${CHUNK_RETRY_MAX_ATTEMPTS} attempts: ${String(lastError)}`);
  }

  const timeToFirstChunkMs = Date.now() - startTime;
  let compressedBytesReceived = byteLength(JSON.stringify(responseEnvelope));
  let chunkRetries = 0;
  let reassembledBase64: string;

  if (responseEnvelope.n === 1) {
    dispatch({ type: "SEND_SUCCESS_COMPLETE", content: responseEnvelope.c });
    reassembledBase64 = responseEnvelope.c;
  } else {
    dispatch({
      type: "SEND_SUCCESS_CHUNKED",
      totalChunks: responseEnvelope.n,
      receivedCount: 1,
    });
    const collected = await fetchRemainingChunks(
      responseEnvelope.r,
      responseEnvelope.n,
      responseEnvelope.c,
      (event) => {
        if (event.type === "CHUNK_FAILED") chunkRetries += 1;
        dispatch(event);
      },
      (bytes) => {
        compressedBytesReceived += bytes;
      }
    );
    reassembledBase64 = reassembleBase64(collected, responseEnvelope.n);
  }

  const decompressed = decodePayload(responseEnvelope.a, reassembledBase64);
  const actualChecksum = await sha256Hex(decompressed);
  if (actualChecksum !== responseEnvelope.k) {
    dispatch({ type: "REASSEMBLY_FAILED", reason: "checksum_mismatch" });
    throw new Error("checksum mismatch after reassembly");
  }

  const response = JSON.parse(decompressed) as ChatResponsePlaintext;
  dispatch({ type: "REASSEMBLY_COMPLETE", content: response.content });

  return {
    response,
    metrics: {
      rawPromptBytes,
      rawResponseBytes: byteLength(decompressed),
      compressedBytesSent,
      compressedBytesReceived,
      totalChunks: responseEnvelope.n,
      chunkRetries,
      timeToFirstChunkMs,
      totalLatencyMs: Date.now() - startTime,
    },
  };
}
