export type MessageStatus = "sending" | "delivered" | "failed" | "queued";

export interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  status: MessageStatus;
  /** Which model answered, for showing on a retry. */
  model?: string;
  note?: string;
  failReason?: string;
  retryCount?: number;
}

export interface PendingSend {
  userMessageId: string;
  startedAt: number;
  notifyRequested: boolean;
}
