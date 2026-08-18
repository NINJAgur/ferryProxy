export type ReassemblyStatus =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "awaiting_chunks"; totalChunks: number; receivedCount: number }
  | { status: "retrying"; attempt: number; totalChunks?: number; receivedCount?: number }
  | { status: "complete"; content: string }
  | { status: "failed"; reason: string };

export type ReassemblyEvent =
  | { type: "SUBMIT" }
  | { type: "SEND_SUCCESS_COMPLETE"; content: string }
  | { type: "SEND_SUCCESS_CHUNKED"; totalChunks: number; receivedCount: number }
  | { type: "SEND_FAILED"; attempt: number }
  | { type: "CHUNK_RECEIVED"; totalChunks: number; receivedCount: number }
  | { type: "CHUNK_FAILED"; attempt: number; totalChunks: number; receivedCount: number }
  | { type: "REASSEMBLY_COMPLETE"; content: string }
  | { type: "REASSEMBLY_FAILED"; reason: string }
  | { type: "RESET" };

export const initialReassemblyState: ReassemblyStatus = { status: "idle" };

export function reassemblyReducer(
  state: ReassemblyStatus,
  event: ReassemblyEvent
): ReassemblyStatus {
  switch (event.type) {
    case "SUBMIT":
      return { status: "sending" };
    case "SEND_SUCCESS_COMPLETE":
      return { status: "complete", content: event.content };
    case "SEND_SUCCESS_CHUNKED":
      return {
        status: "awaiting_chunks",
        totalChunks: event.totalChunks,
        receivedCount: event.receivedCount,
      };
    case "SEND_FAILED":
      return { status: "retrying", attempt: event.attempt };
    case "CHUNK_RECEIVED":
      return {
        status: "awaiting_chunks",
        totalChunks: event.totalChunks,
        receivedCount: event.receivedCount,
      };
    case "CHUNK_FAILED":
      return {
        status: "retrying",
        attempt: event.attempt,
        totalChunks: event.totalChunks,
        receivedCount: event.receivedCount,
      };
    case "REASSEMBLY_COMPLETE":
      return { status: "complete", content: event.content };
    case "REASSEMBLY_FAILED":
      return { status: "failed", reason: event.reason };
    case "RESET":
      return { status: "idle" };
    default:
      return state;
  }
}
