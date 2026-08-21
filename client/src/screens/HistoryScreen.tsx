import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import {
  averageAnswerBytes,
  computeBrevityComparison,
  computeSessionTotals,
  useMetricsStore,
} from "../state/metricsStore";
import { useWide, WIDE_COLUMN } from "../layout";
import { colors, fonts } from "../theme";

export function HistoryScreen() {
  const wide = useWide();
  const messages = useMetricsStore((s) => s.messages);
  const totals = computeSessionTotals(messages);
  const brevity = computeBrevityComparison(messages);
  const averageAnswer = averageAnswerBytes(messages);
  const allBrief = messages.length > 0 && messages.every((m) => m.brief);
  const wireSaved = totals.rawBytes > 0 ? (1 - totals.compressionRatio) * 100 : 0;

  return (
    <View style={[styles.container, wide && styles.column]}>
      <Text style={[styles.title, wide && styles.titleWide]}>What the line carried</Text>
      <Text style={[styles.subtitle, wide && styles.subtitleWide]}>
        Two different savings: how much of each answer you asked for, and how tightly it travelled.
      </Text>

      {/* The larger lever first — on a thin line, a shorter answer beats a
          better-compressed one, and burying that under the transport figure
          made the headline look worse than the app actually is. */}
      <View style={[styles.card, wide && styles.cardWide]}>
        <Text style={[styles.cardLabel, wide && styles.cardLabelWide]}>ASKING FOR LESS</Text>
        {brevity ? (
          <>
            <Text style={[styles.big, wide && styles.bigWide]}>{(brevity.saved * 100).toFixed(0)}% smaller answers</Text>
            <Text style={[styles.cardNote, wide && styles.cardNoteWide]}>
              Short answers here average {Math.round(brevity.briefAvgBytes)} B against{" "}
              {Math.round(brevity.fullAvgBytes)} B for full ones ({brevity.briefCount} vs{" "}
              {brevity.fullCount} replies).
            </Text>
          </>
        ) : averageAnswer !== null ? (
          <>
            {/* No full-length answer has arrived, so there is nothing to compare
                against — how long an answer *would* have been is not something the
                app can know. Show the size that was actually measured instead of
                an empty card and a chore. */}
            <Text style={[styles.big, wide && styles.bigWide]}>{Math.round(averageAnswer)} B per answer</Text>
            <Text style={[styles.cardNote, wide && styles.cardNoteWide]}>
              Averaged over {messages.length} repl{messages.length === 1 ? "y" : "ies"}
              {allBrief ? ", all asked short" : ""}. A full-length answer usually runs several times
              that — Ferry will put the real difference here if it ever sees one.
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.bigMuted, wide && styles.bigMutedWide]}>Nothing sent yet</Text>
            <Text style={[styles.cardNote, wide && styles.cardNoteWide]}>
              Ask something and Ferry measures what it carried, from your own replies rather than
              assumed.
            </Text>
          </>
        )}
      </View>

      <View style={[styles.card, wide && styles.cardWide]}>
        <Text style={[styles.cardLabel, wide && styles.cardLabelWide]}>SENDING IT TIGHTLY</Text>
        <Text style={[styles.big, wireSaved < 0 && styles.bigNegative]}>
          {wireSaved >= 0 ? "" : "−"}
          {Math.abs(wireSaved).toFixed(1)}% on the wire
        </Text>
        <Text style={[styles.cardNote, wide && styles.cardNoteWide]}>
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
          <View style={[styles.row, wide && styles.rowWide]}>
            <Text style={[styles.rowPrompt, wide && styles.rowPromptWide]} numberOfLines={1}>
              {item.prompt}
            </Text>
            <Text style={[styles.rowDetail, wide && styles.rowDetailWide]}>
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
  // The same frame screen A uses: full-window bars, content at a readable
  // width, sized for the window rather than for a phone held at arm's length.
  titleWide: { fontSize: 34, marginBottom: 10 },
  cardWide: { padding: 24, borderRadius: 18, marginBottom: 16 },
  cardLabelWide: { fontSize: 12, letterSpacing: 1.6, marginBottom: 10 },
  bigWide: { fontSize: 30 },
  bigMutedWide: { fontSize: 24 },
  cardNoteWide: { fontSize: 14, lineHeight: 22, marginTop: 8 },
  rowWide: { paddingVertical: 16 },
  rowPromptWide: { fontSize: 16.5 },
  rowDetailWide: { fontSize: 13, marginTop: 5 },
  subtitleWide: { fontSize: 15.5, lineHeight: 25, maxWidth: 640 },
  column: { width: "100%", maxWidth: WIDE_COLUMN, alignSelf: "center", paddingHorizontal: 40 },
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
