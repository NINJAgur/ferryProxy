import {
  ChatRequestEnvelope,
  ChatResponseEnvelope,
  ChunkResponse,
  ErrorEnvelope,
  ProviderStatus,
} from "./types";

export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export async function fetchProviders(timeoutMs = 5000): Promise<ProviderStatus[]> {
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/v1/providers`, { method: "GET" }, timeoutMs);
    if (!response.ok) return [];
    const body = (await response.json()) as { providers: ProviderStatus[] };
    return body.providers;
  } catch {
    return [];
  }
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
  timeoutMs: number
): Promise<ChatResponseEnvelope> {
  const response = await fetchWithTimeout(
    `${BASE_URL}/v1/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    },
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
