import { useEffect, useRef, useState } from "react";

/** If the link comes up within this, the handshake never appears — there was
 *  nothing to wait for, and a panel that flashes past is worse than none. */
export const HANDSHAKE_GRACE_MS = 600;
/** Once it is on screen it stays at least this long, so it can be read. */
export const HANDSHAKE_MIN_VISIBLE_MS = 1800;
/** After the last check ticks, hold briefly so the tick is visible. */
export const HANDSHAKE_SETTLE_MS = 700;

/** Show the panel if the link is still down once the grace period ends — or on a
 *  first run, where it is how someone learns what Ferry is checking. On a fast
 *  local link every check passes instantly, so without this it would never be
 *  seen at all. */
export function shouldAppear(linkReadyAtGraceEnd: boolean, firstRun = false): boolean {
  return firstRun || !linkReadyAtGraceEnd;
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
export function useHandshakeVisibility(
  linkReady: boolean,
  skip: boolean,
  firstRun = false
): [boolean, () => void, () => void] {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const shownAt = useRef<number | null>(null);
  const readyRef = useRef(linkReady);
  readyRef.current = linkReady;
  const firstRunRef = useRef(firstRun);
  firstRunRef.current = firstRun;

  // Wait out the grace period before showing anything.
  useEffect(() => {
    if (skip || dismissed) return;
    const timer = setTimeout(() => {
      if (shouldAppear(readyRef.current, firstRunRef.current)) {
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

  // Bring the panel back when the credential stops working — a key that was
  // revoked, rejected or ran out of quota puts us back to "no line out", and
  // that is exactly what this screen is for.
  const reshow = () => {
    shownAt.current = Date.now();
    setDismissed(false);
    setVisible(true);
  };

  return [visible && !dismissed && !skip, dismiss, reshow];
}
