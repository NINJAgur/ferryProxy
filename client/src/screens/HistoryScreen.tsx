import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import { computeSessionTotals, useMetricsStore } from "../state/metricsStore";
import { colors, fonts } from "../theme";

export function HistoryScreen() {
  const messages = useMetricsStore((s) => s.messages);
  const totals = computeSessionTotals(messages);
  const saved = totals.rawBytes > 0 ? (1 - totals.compressionRatio) * 100 : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>What the line carried</Text>
      <Text style={styles.subtitle}>
        Every byte Ferry actually sent, against what a plain request would have cost.
      </Text>

      <View style={styles.summary}>
        <Row label="Sent over the wire" value={`${totals.compressedBytes.toLocaleString()} B`} />
        <Row label="Plain-request equivalent" value={`${totals.rawBytes.toLocaleString()} B`} />
        <Row label="Saved" value={`${saved.toFixed(1)}%`} accent />
        <Row label="Pieces" value={String(totals.totalChunks)} />
        <Row label="Retries" value={String(totals.chunkRetries)} />
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
              {item.compressedBytesSent + item.compressedBytesReceived}B sent ·{" "}
              {item.rawPromptBytes + item.rawResponseBytes}B plain · {item.totalChunks} piece
              {item.totalChunks === 1 ? "" : "s"} · {item.chunkRetries} retr
              {item.chunkRetries === 1 ? "y" : "ies"} · {item.totalLatencyMs}ms
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Nothing sent yet.</Text>}
      />
    </View>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, accent && styles.summaryValueAccent]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 22, paddingTop: 24 },
  title: { fontFamily: fonts.heading, fontSize: 24, color: colors.text, letterSpacing: -0.36, marginBottom: 8 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.text55, marginBottom: 20, lineHeight: 20 },
  summary: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.neutral800,
    padding: 16,
    marginBottom: 20,
    gap: 10,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.text55 },
  summaryValue: { fontFamily: fonts.heading, fontSize: 13, color: colors.text },
  summaryValueAccent: { color: colors.accent400 },
  row: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.divider08 },
  rowPrompt: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  rowDetail: { fontFamily: fonts.body, fontSize: 11, color: colors.text40, marginTop: 3 },
  empty: { fontFamily: fonts.body, fontSize: 13, color: colors.text40, textAlign: "center", marginTop: 24 },
});
