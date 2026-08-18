import {
  initialReassemblyState,
  reassemblyReducer,
} from "../../src/transport/reassemblyState";

describe("reassemblyReducer", () => {
  it("starts idle", () => {
    expect(initialReassemblyState).toEqual({ status: "idle" });
  });

  it("SUBMIT moves idle -> sending", () => {
    const next = reassemblyReducer(initialReassemblyState, { type: "SUBMIT" });
    expect(next).toEqual({ status: "sending" });
  });

  it("SEND_SUCCESS_COMPLETE moves sending -> complete", () => {
    const sending = reassemblyReducer(initialReassemblyState, { type: "SUBMIT" });
    const next = reassemblyReducer(sending, {
      type: "SEND_SUCCESS_COMPLETE",
      content: "chunk0",
    });
    expect(next).toEqual({ status: "complete", content: "chunk0" });
  });

  it("SEND_SUCCESS_CHUNKED moves sending -> awaiting_chunks", () => {
    const sending = reassemblyReducer(initialReassemblyState, { type: "SUBMIT" });
    const next = reassemblyReducer(sending, {
      type: "SEND_SUCCESS_CHUNKED",
      totalChunks: 3,
      receivedCount: 1,
    });
    expect(next).toEqual({ status: "awaiting_chunks", totalChunks: 3, receivedCount: 1 });
  });

  it("SEND_FAILED moves sending -> retrying", () => {
    const sending = reassemblyReducer(initialReassemblyState, { type: "SUBMIT" });
    const next = reassemblyReducer(sending, { type: "SEND_FAILED", attempt: 0 });
    expect(next).toEqual({ status: "retrying", attempt: 0 });
  });

  it("CHUNK_RECEIVED keeps awaiting_chunks with updated progress", () => {
    const awaiting = reassemblyReducer(initialReassemblyState, {
      type: "SEND_SUCCESS_CHUNKED",
      totalChunks: 3,
      receivedCount: 1,
    });
    const next = reassemblyReducer(awaiting, {
      type: "CHUNK_RECEIVED",
      totalChunks: 3,
      receivedCount: 2,
    });
    expect(next).toEqual({ status: "awaiting_chunks", totalChunks: 3, receivedCount: 2 });
  });

  it("CHUNK_FAILED moves awaiting_chunks -> retrying, preserving progress", () => {
    const awaiting = reassemblyReducer(initialReassemblyState, {
      type: "SEND_SUCCESS_CHUNKED",
      totalChunks: 3,
      receivedCount: 1,
    });
    const next = reassemblyReducer(awaiting, {
      type: "CHUNK_FAILED",
      attempt: 1,
      totalChunks: 3,
      receivedCount: 1,
    });
    expect(next).toEqual({ status: "retrying", attempt: 1, totalChunks: 3, receivedCount: 1 });
  });

  it("REASSEMBLY_COMPLETE moves to complete", () => {
    const retrying = reassemblyReducer(initialReassemblyState, { type: "SEND_FAILED", attempt: 2 });
    const next = reassemblyReducer(retrying, {
      type: "REASSEMBLY_COMPLETE",
      content: "final content",
    });
    expect(next).toEqual({ status: "complete", content: "final content" });
  });

  it("REASSEMBLY_FAILED moves to failed with reason", () => {
    const retrying = reassemblyReducer(initialReassemblyState, { type: "SEND_FAILED", attempt: 4 });
    const next = reassemblyReducer(retrying, {
      type: "REASSEMBLY_FAILED",
      reason: "checksum_mismatch",
    });
    expect(next).toEqual({ status: "failed", reason: "checksum_mismatch" });
  });

  it("RESET returns to idle from any state", () => {
    const failed = reassemblyReducer(initialReassemblyState, {
      type: "REASSEMBLY_FAILED",
      reason: "x",
    });
    expect(reassemblyReducer(failed, { type: "RESET" })).toEqual({ status: "idle" });
  });
});
