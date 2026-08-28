import React, { useEffect, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";

import { Text } from "./AppText";

import { colors, fonts, radius } from "../theme";
import { useMotion, usePulse } from "../motion";
import { ReassemblyStatus } from "../transport/reassemblyState";
import { Button } from "./Button";

interface PendingCardProps {
  state: ReassemblyStatus;
  startedAt: number;
  /** Absorb this many retries before telling the user about them. */
  quietRetries: number;
  /** When set, elapsing past this asks whether to keep waiting. */
  warnAfterMs?: number;
  notifyRequested: boolean;
  partialText?: string;
  onStop: () => void;
  onNotifyMe: () => void;
}

export function PendingCard({
  state,
  startedAt,
  quietRetries,
  warnAfterMs,
  notifyRequested,
  partialText,
  onStop,
  onNotifyMe,
}: PendingCardProps) {
  const [elapsedMs, setElapsedMs] = useState(Date.now() - startedAt);
  // This is the screen someone stares at longest. A slow breath says the app is
  // still working; a still frame for forty seconds says it has died.
  const pulse = usePulse(useMotion());
  const [warningDismissed, setWarningDismissed] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const totalChunks = "totalChunks" in state ? state.totalChunks : undefined;
  const receivedCount = "receivedCount" in state ? state.receivedCount : undefined;
  const chunked = !!totalChunks && totalChunks > 1;
  const attempt = state.status === "retrying" ? state.attempt : -1;
  // Only mention retries once they exceed the quiet allowance.
  const surfaceRetry = attempt >= quietRetries;

  // "Warn me before long answers" — a real gate, not a label: past the threshold
  // Ferry asks whether to keep waiting instead of silently continuing.
  if (warnAfterMs && elapsedMs > warnAfterMs && !warningDismissed) {
    return (
      <View style={styles.longCard}>
        <Text style={styles.elapsed}>{formatElapsed(elapsedMs)}</Text>
        <Text style={styles.longNote}>
          This one is over a minute. Keep waiting, or stop and try a shorter question?
        </Text>
        <View style={styles.actions}>
          <Button label="Keep waiting" onPress={() => setWarningDismissed(true)} height={48} fontSize={15} />
          <Button label="Stop waiting" onPress={onStop} variant="ghost" height={44} fontSize={14} />
        </View>
      </View>
    );
  }

  // 1b — the compact "working on it" card, before we know the answer is long.
  if (!chunked) {
    return (
      <View style={styles.shortCard}>
        <Animated.Text style={[styles.shortTitle, { opacity: pulse }]}>
          {surfaceRetry
            ? `Still trying — attempt ${attempt + 1}.`
            : `Working on it — ${formatElapsed(elapsedMs)} so far.`}
        </Animated.Text>
        <Text style={styles.shortNote}>Answers come back a piece at a time on a connection this thin.</Text>
      </View>
    );
  }

  // 1c — the long wait, with pieces, a partial answer, and the two actions.
  const eta = estimateRemaining(elapsedMs, receivedCount ?? 0, totalChunks);
  let note = surfaceRetry
    ? `A piece had to be asked for again — attempt ${attempt + 1}.`
    : `Still working. Long answers take longer to come across${eta ? ` — this one looks like about ${eta} more` : ""}.`;

  return (
    <View style={styles.longWrap}>
      <View style={styles.longCard}>
        <Text style={styles.elapsed}>{formatElapsed(elapsedMs)}</Text>
        <Text style={styles.longNote}>{note}</Text>
        <View style={styles.pieces}>
          {Array.from({ length: totalChunks }, (_, i) => (
            <View key={i} style={[styles.piece, { backgroundColor: pieceColor(i, receivedCount ?? 0) }]} />
          ))}
        </View>
        <Text style={styles.piecesLabel}>
          {spell(receivedCount ?? 0)} of {spell(totalChunks)} pieces here
        </Text>
      </View>

      {partialText ? (
        <View style={styles.partial}>
          <Text style={styles.partialText}>{partialText}…</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={notifyRequested ? "We'll tell you when it lands" : "Tell me when it lands"}
          onPress={onNotifyMe}
          disabled={notifyRequested}
          height={48}
          fontSize={15}
        />
        <Button label="Stop waiting" onPress={onStop} variant="ghost" height={44} fontSize={14} />
        <Text style={styles.caption}>You can close Ferry. It keeps going.</Text>
      </View>
    </View>
  );
}

function pieceColor(index: number, received: number): string {
  if (index < received) return colors.accent;
  if (index === received) return colors.accent700;
  return colors.neutral800;
}

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
function spell(n: number): string {
  return n <= 10 ? WORDS[n] : String(n);
}

function estimateRemaining(elapsedMs: number, received: number, total: number): string | null {
  if (received === 0 || received >= total) return null;
  return formatElapsed((elapsedMs / received) * (total - received));
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  return m ? `${m}m ${total % 60}s` : `${total}s`;
}

const styles = StyleSheet.create({
  shortCard: {
    alignSelf: "flex-start",
    maxWidth: "82%",
    borderWidth: 1,
    borderColor: colors.neutral800,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.card,
    marginBottom: 14,
  },
  shortTitle: { fontFamily: fonts.body, fontSize: 13, color: colors.text75 },
  shortNote: { fontFamily: fonts.body, fontSize: 12, color: colors.text45, marginTop: 4, lineHeight: 18 },

  longWrap: { alignSelf: "stretch", gap: 16, marginBottom: 14 },
  longCard: {
    borderWidth: 1,
    borderColor: colors.neutral800,
    borderRadius: radius.lg,
    paddingVertical: 20,
    paddingHorizontal: 18,
    backgroundColor: colors.card,
    marginBottom: 14,
  },
  elapsed: { fontFamily: fonts.heading, fontSize: 22, color: colors.text, lineHeight: 24.2 },
  longNote: { fontFamily: fonts.body, fontSize: 13, color: colors.text60, marginTop: 8, lineHeight: 19.5 },
  pieces: { flexDirection: "row", gap: 3, marginTop: 16 },
  piece: { height: 4, flex: 1, borderRadius: 2 },
  piecesLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.text40, marginTop: 9 },

  partial: { borderLeftWidth: 2, borderLeftColor: colors.accent700, paddingVertical: 2, paddingLeft: 14 },
  partialText: { fontFamily: fonts.body, fontSize: 14, color: colors.text80, lineHeight: 21 },

  actions: { gap: 10, marginTop: 12 },
  caption: { fontFamily: fonts.body, fontSize: 12, color: colors.text40, textAlign: "center" },
});
