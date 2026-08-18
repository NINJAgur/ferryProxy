import { Provider } from "../transport/types";

export type MessageStatus = "sending" | "delivered" | "failed" | "queued";

export interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  status: MessageStatus;
  provider?: Provider;
  note?: string;
  failReason?: string;
  retryCount?: number;
}

export interface PendingSend {
  userMessageId: string;
  startedAt: number;
  notifyRequested: boolean;
}
