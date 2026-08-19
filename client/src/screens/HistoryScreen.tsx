import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { computeBrevityComparison, computeSessionTotals, useMetricsStore } from "../state/metricsStore";
import { colors, fonts } from "../theme";

export function HistoryScreen() {
  const messages = useMetricsStore((s) => s.messages);
  const totals = computeSessionTotals(messages);
  const brevity = computeBrevityComparison(messages);
  const wireSaved = totals.rawBytes > 0 ? (1 - totals.compressionRatio) * 100 : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>What the line carried</Text>
      <Text style={styles.subtitle}>
        Two different savings: how much of each answer you asked for, and how tightly it travelled.
      </Text>

      {/* The larger lever first — on a thin line, a shorter answer beats a
          better-compressed one, and burying that under the transport figure
          made the headline look worse than the app actually is. */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>ASKING FOR LESS</Text>
        {brevity ? (
          <>
            <Text style={styles.big}>{(brevity.saved * 100).toFixed(0)}% smaller answers</Text>
            <Text style={styles.cardNote}>
              Short answers here average {Math.round(brevity.briefAvgBytes)} B against{" "}
              {Math.round(brevity.fullAvgBytes)} B for full ones ({brevity.briefCount} vs{" "}
              {brevity.fullCount} replies).
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.bigMuted}>Not measured yet</Text>
            <Text style={styles.cardNote}>
              Send one answer with “Answer short first” on and one with it off, and the difference
              gets measured here from your own replies rather than assumed.
            </Text>
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>SENDING IT TIGHTLY</Text>
        <Text style={[styles.big, wireSaved < 0 && styles.bigNegative]}>
          {wireSaved >= 0 ? "" : "−"}
          {Math.abs(wireSaved).toFixed(1)}% on the wire
        </Text>
        <Text style={styles.cardNote}>
          {totals.compressedBytes.toLocaleString()} B sent against{" "}
          {totals.rawBytes.toLocaleString()} B plain · {totals.totalChunks} piece
          {totals.totalChunks === 1 ? "" : "s"} · {totals.chunkRetries} retr
          {totals.chunkRetries === 1 ? "y" : "ies"}
          {wireSaved < 0 ? " — short answers cost more to wrap than compression saves." : ""}
        </Text>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowPrompt} numberOfLines={1}>
              {item.prompt}
            </Text>
            <Text style={styles.rowDetail}>
              {item.brief ? "short · " : ""}
              {item.rawResponseBytes} B answer · {item.compressedBytesSent + item.compressedBytesReceived}B
              sent · {item.totalChunks} piece{item.totalChunks === 1 ? "" : "s"} · {item.totalLatencyMs}ms
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Nothing sent yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 22, paddingTop: 24 },
  title: { fontFamily: fonts.heading, fontSize: 24, color: colors.text, letterSpacing: -0.36, marginBottom: 8 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.text55, marginBottom: 18, lineHeight: 20 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.neutral800,
    padding: 16,
    marginBottom: 12,
  },
  cardLabel: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.4, color: colors.accent, marginBottom: 8 },
  big: { fontFamily: fonts.heading, fontSize: 22, color: colors.accent400 },
  bigNegative: { color: colors.text55 },
  bigMuted: { fontFamily: fonts.heading, fontSize: 18, color: colors.text45 },
  cardNote: { fontFamily: fonts.body, fontSize: 12, color: colors.text55, marginTop: 6, lineHeight: 18 },
  row: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.divider08 },
  rowPrompt: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  rowDetail: { fontFamily: fonts.body, fontSize: 11, color: colors.text40, marginTop: 3 },
  empty: { fontFamily: fonts.body, fontSize: 13, color: colors.text40, textAlign: "center", marginTop: 24 },
});
