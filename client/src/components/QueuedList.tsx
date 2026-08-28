import React from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "./AppText";

import { QueuedMessage } from "../queue/offlineQueue";
import { colors, fonts } from "../theme";

export function QueuedList({ messages }: { messages: QueuedMessage[] }) {
  if (messages.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.lead}>
        Keep writing. They go out the moment there's a line, in the order you wrote them.
      </Text>
      <View style={styles.list}>
        {messages.map((message, index) => (
          <View key={message.id} style={styles.card}>
            <Text style={styles.cardText}>{message.prompt}</Text>
            <Text style={styles.cardMeta}>
              Written {formatTime(message.createdAt)}
              {index === 0 ? " · first in line" : ""}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 18 },
  lead: { fontFamily: fonts.body, fontSize: 13, color: colors.text55, marginBottom: 16, lineHeight: 20 },
  list: { gap: 10 },
  card: {
    borderWidth: 1,
    borderColor: colors.neutral800,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 15,
    backgroundColor: colors.card,
  },
  cardText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20.3, color: colors.text },
  cardMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.text40, marginTop: 8 },
});
