import {
  ChatRequestEnvelope,
  ChatResponseEnvelope,
  ChunkResponse,
  ErrorEnvelope,
  SessionInfo,
} from "./types";

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

/** Works with or without a token: anonymous callers still get the free model. */
export async function fetchSession(idToken?: string, timeoutMs = 15000): Promise<SessionInfo> {
  const headers: Record<string, string> = {};
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const response = await fetchWithTimeout(
    `${BASE_URL}/v1/session`,
    { method: "POST", headers },
    timeoutMs
  );
  if (!response.ok) {
    throw new HttpError(response.status, await safeJson<ErrorEnvelope>(response));
  }
  return response.json();
}

export async function setSubscription(
  idToken: string,
  subscribed: boolean,
  timeoutMs = 15000
): Promise<SessionInfo> {
  const response = await fetchWithTimeout(
    `${BASE_URL}/v1/subscription`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ subscribed }),
    },
    timeoutMs
  );
  if (!response.ok) {
    throw new HttpError(response.status, await safeJson<ErrorEnvelope>(response));
  }
  return response.json();
}

export async function checkHealth(timeoutMs = 5000): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/health`, { method: "GET" }, timeoutMs);
    return response.ok;
  } catch {
    return false;
  }
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
  idToken?: string
): Promise<ChatResponseEnvelope> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Identity, not a credential: the relay works out what this account may use and
  // supplies its own provider key. No API key ever reaches the device.
  if (idToken) headers["Authorization"] = `Bearer ${idToken}`;
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
