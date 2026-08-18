import {
  HANDSHAKE_MIN_VISIBLE_MS,
  HANDSHAKE_SETTLE_MS,
  holdDurationMs,
  shouldAppear,
} from "../src/useHandshakeVisibility";

describe("shouldAppear", () => {
  it("stays hidden when the link is already up at the end of the grace period", () => {
    expect(shouldAppear(true)).toBe(false);
  });

  it("appears when the link is still down at the end of the grace period", () => {
    expect(shouldAppear(false)).toBe(true);
  });

  it("appears on a first run even when everything is instantly ready", () => {
    // Otherwise a fast local link means the panel is never seen at all.
    expect(shouldAppear(true, true)).toBe(true);
  });

  it("stays hidden on later runs once the link is up", () => {
    expect(shouldAppear(true, false)).toBe(false);
  });
});

describe("holdDurationMs", () => {
  it("holds a just-appeared panel for the full readable minimum", () => {
    // Link came up the instant the panel appeared — the worst flash case.
    expect(holdDurationMs(0)).toBe(HANDSHAKE_MIN_VISIBLE_MS);
  });

  it("holds the remainder when the panel has been up a while", () => {
    expect(holdDurationMs(1000)).toBe(HANDSHAKE_MIN_VISIBLE_MS - 1000);
  });

  it("never drops below the settle time, so the last tick is visible", () => {
    expect(holdDurationMs(HANDSHAKE_MIN_VISIBLE_MS)).toBe(HANDSHAKE_SETTLE_MS);
    expect(holdDurationMs(99999)).toBe(HANDSHAKE_SETTLE_MS);
  });

  it("is always long enough to notice", () => {
    for (const elapsed of [0, 250, 900, 1799, 5000]) {
      expect(holdDurationMs(elapsed)).toBeGreaterThanOrEqual(HANDSHAKE_SETTLE_MS);
    }
  });
});
