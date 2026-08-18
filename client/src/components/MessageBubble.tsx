import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ThreadMessage } from "../state/thread";
import { Markdown } from "./Markdown";
import { PressState } from "./pressState";
import { colors, fonts, radius } from "../theme";

interface MessageBubbleProps {
  message: ThreadMessage;
  onRetry?: () => void;
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
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
          <Text style={[styles.text, styles.textUser, failed && styles.textFailed]}>{message.content}</Text>
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
        <Text style={styles.meta}>{metaLabel(message)}</Text>
      )}

      {failed ? (
        <View style={styles.explainCard}>
          <Text style={styles.explainTitle}>The connection dropped mid-sentence.</Text>
          <Text style={styles.explainBody}>
            Nothing is lost. Ferry picks up where it stopped rather than starting over, so a retry costs
            seconds, not minutes.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function metaLabel(message: ThreadMessage): string {
  const time = formatTime(message.timestamp);
  if (message.role === "assistant") return message.note ? message.note : time;
  if (message.status === "sending") return "Sending…";
  if (message.status === "queued") return "Waiting for a line";
  return `Delivered ${time}`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const styles = StyleSheet.create({
  row: { gap: 5, marginBottom: 14, maxWidth: "84%" },
  rowUser: { alignSelf: "flex-end", alignItems: "flex-end" },
  rowAssistant: { alignSelf: "flex-start", alignItems: "flex-start" },
  bubble: { borderRadius: radius.lg, paddingVertical: 12, paddingHorizontal: 15 },
  bubbleAssistant: { backgroundColor: colors.surface },
  bubbleUser: { backgroundColor: colors.accent900 },
  // 1e: the un-delivered bubble is a dashed outline on the card ground, not a faded fill.
  bubbleFailed: { backgroundColor: colors.card, borderWidth: 1, borderStyle: "dashed", borderColor: colors.neutral700 },
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text },
  textUser: { color: colors.accent200 },
  textFailed: { color: colors.text65 },
  meta: { fontFamily: fonts.body, fontSize: 11, color: colors.text40, paddingHorizontal: 4 },
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
