import {
  ChatRequestEnvelope,
  ChatResponseEnvelope,
  ChunkResponse,
  EntitlementInfo,
  ErrorEnvelope,
} from "./types";

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

/** The store receipt travels here. No receipt is the free tier, not an error. */
export const RECEIPT_HEADER = "X-Store-Receipt";

function receiptHeaders(receipt?: string): Record<string, string> {
  return receipt ? { [RECEIPT_HEADER]: receipt } : {};
}

/**
 * How long a relay that is merely asleep may take to answer.
 *
 * A hosted relay that has been idle spends 30-50s starting a container before it
 * can reply at all. Giving up sooner reports a working server as unreachable,
 * which is what a short timeout did. A server that is genuinely gone fails on the
 * connection instead, so this ceiling costs nothing in the common failure.
 */
export const COLD_START_TIMEOUT_MS = 60000;

/** A relay that is still waking, rather than one that is broken. */
function isWaking(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

const WAKE_RETRY_DELAY_MS = 3000;

/** Works with or without a receipt: anonymous callers still get the free model. */
export async function fetchEntitlement(
  receipt?: string,
  timeoutMs = COLD_START_TIMEOUT_MS
): Promise<EntitlementInfo> {
  const deadline = Date.now() + timeoutMs;
  let lastError: HttpError | undefined;

  // Keep asking while the relay is only asleep. One attempt is not enough: a
  // hosted relay answers 503 immediately while its container starts, so a single
  // try reports a server that is merely waking as one that is broken.
  do {
    try {
      const response = await fetchWithTimeout(
        `${BASE_URL}/v1/entitlement`,
        { method: "POST", headers: receiptHeaders(receipt) },
        timeoutMs
      );
      if (response.ok) return response.json();

      lastError = new HttpError(response.status, await safeJson<ErrorEnvelope>(response));
      // Anything else is a real answer and will not change by asking again.
      if (!isWaking(response.status)) throw lastError;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      lastError = undefined;
    }
    await sleep(WAKE_RETRY_DELAY_MS);
  } while (Date.now() < deadline);

  throw lastError ?? new HttpError(0, undefined);
}

export async function checkHealth(timeoutMs = COLD_START_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      const response = await fetchWithTimeout(`${BASE_URL}/health`, { method: "GET" }, timeoutMs);
      if (response.ok) return true;
    } catch {
      // A refused connection and a 503 both mean "not yet"; both are worth retrying
      // until the deadline, because a sleeping relay produces each in turn.
    }
    await sleep(WAKE_RETRY_DELAY_MS);
  } while (Date.now() < deadline);
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HttpError extends Error {
  status: number;
  body: ErrorEnvelope | undefined;

  constructor(status: number, body: ErrorEnvelope | undefined) {
    super(body?.message ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function postChat(
  envelope: ChatRequestEnvelope,
  timeoutMs: number,
  receipt?: string
): Promise<ChatResponseEnvelope> {
  // Proof of purchase, not a credential: the relay works out what the receipt may
  // use and supplies its own provider key. No API key ever reaches the device.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...receiptHeaders(receipt),
  };
  const response = await fetchWithTimeout(
    `${BASE_URL}/v1/chat`,
    { method: "POST", headers, body: JSON.stringify(envelope) },
    timeoutMs
  );

  if (!response.ok) {
    throw new HttpError(response.status, await safeJson<ErrorEnvelope>(response));
  }
  return response.json();
}

export async function getChunk(
  requestId: string,
  index: number,
  timeoutMs: number
): Promise<ChunkResponse> {
  const response = await fetchWithTimeout(
    `${BASE_URL}/v1/chat/${requestId}/chunks/${index}`,
    { method: "GET" },
    timeoutMs
  );

  if (!response.ok) {
    throw new HttpError(response.status, await safeJson<ErrorEnvelope>(response));
  }
  return response.json();
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}
