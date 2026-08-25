import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useMetricsStore } from "../state/metricsStore";
import { ThreadMessage } from "../state/thread";
import { Markdown } from "./Markdown";
import { PressState } from "./pressState";
import { colors, fonts, fontsFor, radius, readsRightToLeft } from "../theme";

interface MessageBubbleProps {
  message: ThreadMessage;
  onRetry?: () => void;
}

function costFor(id: string): string | null {
  const metrics = useMetricsStore((s) => s.messages.find((m) => m.id === id));
  if (!metrics) return null;
  return (
    `${metrics.brief ? "short · " : ""}${metrics.rawResponseBytes} B answer · ` +
    `${metrics.compressedBytesSent + metrics.compressedBytesReceived}B sent · ` +
    `${metrics.totalChunks} piece${metrics.totalChunks === 1 ? "" : "s"} · ${metrics.totalLatencyMs}ms`
  );
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const cost = costFor(message.id);
  const isUser = message.role === "user";
  const failed = message.status === "failed";
  const retrying = message.status === "sending" && !!message.failReason;

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
          failed && styles.bubbleFailed,
        ]}
      >
        {isUser ? (
          <Text
            selectable
            style={[
              styles.text,
              { fontFamily: fontsFor(message.content).body },
              readsRightToLeft(message.content) && styles.rightToLeft,
              styles.textUser,
              failed && styles.textFailed,
            ]}
          >
            {message.content}
          </Text>
        ) : (
          <Markdown text={message.content} />
        )}
      </View>

      {failed ? (
        <View style={styles.retryRow}>
          <Text style={styles.retryLabel}>{retrying ? "Trying again…" : "Didn't get through"}</Text>
          {onRetry ? (
            <Pressable
              onPress={onRetry}
              disabled={retrying}
              style={({ hovered }: PressState) => [
                styles.retryPill,
                retrying && styles.retryPillInactive,
                hovered && !retrying && { backgroundColor: colors.accent900 },
              ]}
            >
              <Text style={[styles.retryCta, retrying && styles.retryCtaInactive]}>
                {retrying ? "Sending" : "Send again"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={styles.meta}>
          {metaLabel(message)}
          {/* What this one answer cost on the wire, next to when it landed. The
              Data screen totals whole chats; the detail belongs where the
              message is. */}
          {cost ? <Text style={styles.costDetail}>{`  ·  ${cost}`}</Text> : null}
        </Text>
      )}

      {failed ? (
        <View style={styles.explainCard}>
          {/* Only a transport failure is a dropped line. Saying so about a refusal
              from the relay sends someone to check their signal for no reason. */}
          <Text style={styles.explainTitle}>
            {message.failReason ?? "The connection dropped mid-sentence."}
          </Text>
          <Text style={styles.explainBody}>
            {message.failReason
              ? "Retrying costs seconds — nothing you wrote is lost."
              : "Nothing is lost. Ferry picks up where it stopped rather than starting over, so a retry costs seconds, not minutes."}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function metaLabel(message: ThreadMessage): string {
  const time = formatTime(message.timestamp);
  if (message.role === "assistant") return time;
  if (message.status === "sending") return "Sending…";
  if (message.status === "queued") return "Waiting for a line";
  return `Delivered ${time}`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const styles = StyleSheet.create({
  // minWidth 0 matters: a run of characters with no spaces gives a flex item an
  // automatic minimum size of its longest word, which overrides maxWidth and
  // lets the bubble spill across the screen.
  row: { gap: 5, marginBottom: 14, maxWidth: "84%", minWidth: 0, flexShrink: 1 },
  rowUser: { alignSelf: "flex-end", alignItems: "flex-end" },
  rowAssistant: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubble: { borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 15, minWidth: 0, flexShrink: 1 },
  bubbleAssistant: { backgroundColor: colors.surface },
  bubbleUser: { backgroundColor: colors.accent900 },
  // 1e: the un-delivered bubble is a dashed outline on the card ground, not a faded fill.
  bubbleFailed: { backgroundColor: colors.card, borderWidth: 1, borderStyle: "dashed", borderColor: colors.neutral700 },
  // auto, not left: the message is aligned by its own first letter, so Hebrew
  // reads from the right without flipping the app around it.
  text: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.text, flexShrink: 1, textAlign: "auto" },
  // Said outright for the messages auto gets wrong. Android reads "auto" as the
  // app's own direction and pins a Hebrew message to the left edge; only an
  // explicit right reaches the gravity that puts it back where it belongs.
  rightToLeft: { textAlign: "right", writingDirection: "rtl" },
  textUser: { color: colors.accent200 },
  textFailed: { color: colors.text65 },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.text40, paddingHorizontal: 4 },
  costDetail: { color: colors.text40 },
  retryRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  retryLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.text50 },
  retryPill: {
    height: 30,
    paddingHorizontal: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  retryPillInactive: { borderColor: colors.neutral700 },
  retryCta: { fontFamily: fonts.heading, fontSize: 12, color: colors.accent400 },
  retryCtaInactive: { color: colors.text45 },
  explainCard: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: colors.neutral800,
    borderRadius: 12,
    padding: 15,
    backgroundColor: colors.card,
    marginTop: 8,
  },
  explainTitle: { fontFamily: fonts.heading, fontSize: 13, color: colors.text },
  explainBody: { fontFamily: fonts.body, fontSize: 12.5, color: colors.text55, marginTop: 6, lineHeight: 18.75 },
});
