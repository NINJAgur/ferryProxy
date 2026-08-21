import { decodePayload, encodePayload, sha256Hex } from "./compression";
import { generateId } from "./ids";
import { getChunk, HttpError, postChat } from "./httpClient";
import {
  initialReassemblyState,
  ReassemblyEvent,
  reassemblyReducer,
  ReassemblyStatus,
} from "./reassemblyState";
import { ChatRequestPlaintext, ChatResponsePlaintext, HistoryMessage } from "./types";

/** Fetching one cached slice is quick; if it hasn't arrived in 8s the line dropped it. */
export const CHUNK_FETCH_TIMEOUT_MS = 8000;
/** The opening POST is different in kind: it waits for the model to generate the whole
 *  answer. Gemini's Flash models think before answering and have taken 18s+ on a trivial
 *  prompt, so holding this to the chunk timeout made every real send fail and retry. */
export const SEND_TIMEOUT_MS = 90000;
export const CHUNK_RETRY_BASE_DELAY_MS = 500;
/**
 * How long to wait between attempts, and how many to make.
 *
 * These were 8s and 5, which is the shape you use when the far end is
 * overloaded: back off hard, give up quickly. On a line that drops packets the
 * far end is fine, and both halves of that are wrong. Five attempts gives a
 * chunk a 1 - 0.9^5 = 41% chance of landing at 90% loss, so a four-chunk answer
 * completes about 3% of the time — measured at 0/10.
 *
 * Measured against the loss proxy at 90%: 20 attempts with a 2s cap gave 4/5,
 * and 40 attempts with a 1s cap gave 5/5, median 44.5s. Backing off less and
 * trying more is what a lossy channel wants, because waiting does not help when
 * nothing is congested.
 */
export const CHUNK_RETRY_MAX_DELAY_MS = 1000;
export const CHUNK_RETRY_MAX_ATTEMPTS = 40;
export const CHUNK_RETRY_JITTER = 0.2;
export const CHUNK_FETCH_CONCURRENCY = 3;
/**
 * Sends are rationed differently, because they are not free.
 *
 * A chunk fetch reads from the relay's cache and costs nothing, so trying forty
 * times is cheap. A send that reaches the relay makes a model generate an
 * answer, and a reply lost on the way back still burned it. Retrying a send
 * forty times could pay for forty answers to deliver one.
 */
export const SEND_RETRY_MAX_ATTEMPTS = 5;
/** Still ample: the 40-attempt run's worst case was 69s. */
export const REASSEMBLY_BUDGET_MS = 180000;

export interface SendPromptInput {
  prompt: string;
  history?: HistoryMessage[];
  /** The relay's catalogue decides the provider and which service key serves it. */
  model?: string;
  maxTokens?: number;
  brief?: boolean;
  /** Proof of purchase, when there is one. Without it the relay serves the free tier. */
  receipt?: string;
  sessionId: string;
}

export interface SendPromptMetrics {
  /** Whether this answer was asked for briefly — the single biggest lever on
   *  a thin line, and meaningless to compare against a full answer without it. */
  brief: boolean;
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
    runRequest(
      envelope,
      dispatch,
      startTime,
      rawPromptBytes,
      compressedBytesSent,
      input.receipt,
      !!input.brief
    ),
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
  receipt?: string,
  brief = false
): Promise<SendPromptResult> {
  let responseEnvelope: Awaited<ReturnType<typeof postChat>> | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < SEND_RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      responseEnvelope = await postChat(envelope, SEND_TIMEOUT_MS, receipt);
      break;
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) {
        dispatch({ type: "REASSEMBLY_FAILED", reason: String((err as Error).message ?? err) });
        throw err;
      }
      dispatch({ type: "SEND_FAILED", attempt });
      if (attempt < SEND_RETRY_MAX_ATTEMPTS - 1) {
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
      : new Error(`POST /v1/chat failed after ${SEND_RETRY_MAX_ATTEMPTS} attempts: ${String(lastError)}`);
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
      brief,
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
