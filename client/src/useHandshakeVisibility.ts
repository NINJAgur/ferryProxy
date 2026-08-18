import { useEffect, useRef, useState } from "react";

/** If the link comes up within this, the handshake never appears — there was
 *  nothing to wait for, and a panel that flashes past is worse than none. */
export const HANDSHAKE_GRACE_MS = 600;
/** Once it is on screen it stays at least this long, so it can be read. */
export const HANDSHAKE_MIN_VISIBLE_MS = 1800;
/** After the last check ticks, hold briefly so the tick is visible. */
export const HANDSHAKE_SETTLE_MS = 700;

/** Show the panel only if the link is still down once the grace period ends. */
export function shouldAppear(linkReadyAtGraceEnd: boolean): boolean {
  return !linkReadyAtGraceEnd;
}

/** How much longer a panel that is already up must stay, so it never blinks out.
 *  `visibleForMs` is how long it has been on screen when the link came up. */
export function holdDurationMs(visibleForMs: number): number {
  return Math.max(HANDSHAKE_SETTLE_MS, HANDSHAKE_MIN_VISIBLE_MS - visibleForMs);
}

/**
 * Decides whether the "Finding you a line out" panel should be on screen.
 * Shows it only for a wait that is actually happening, and never for a blink.
 */
export function useHandshakeVisibility(linkReady: boolean, skip: boolean): [boolean, () => void] {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const shownAt = useRef<number | null>(null);
  const readyRef = useRef(linkReady);
  readyRef.current = linkReady;

  // Wait out the grace period before showing anything.
  useEffect(() => {
    if (skip || dismissed) return;
    const timer = setTimeout(() => {
      if (shouldAppear(readyRef.current)) {
        shownAt.current = Date.now();
        setVisible(true);
      }
    }, HANDSHAKE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [skip, dismissed]);

  // Once the link is up, let the final tick land, then move on — but never
  // before the panel has been up long enough to read.
  useEffect(() => {
    if (!visible || !linkReady) return;
    const visibleFor = Date.now() - (shownAt.current ?? Date.now());
    const timer = setTimeout(() => {
      setVisible(false);
      setDismissed(true);
    }, holdDurationMs(visibleFor));
    return () => clearTimeout(timer);
  }, [visible, linkReady]);

  const dismiss = () => {
    setVisible(false);
    setDismissed(true);
  };

  return [visible && !dismissed && !skip, dismiss];
}
