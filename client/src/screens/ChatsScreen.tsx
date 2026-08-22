import React from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { PressState } from "../components/pressState";
import { VersionFooter } from "../components/VersionFooter";
import { Conversation, useThreadStore } from "../state/threadStore";
import { useWide, WIDE_COLUMN } from "../layout";
import { colors, fonts } from "../theme";

interface ChatsScreenProps {
  onOpen: (id: string) => void;
}

export function ChatsScreen({ onOpen }: ChatsScreenProps) {
  const wide = useWide();
  const conversations = useThreadStore((s) => s.conversations);
  const remove = useThreadStore((s) => s.remove);

  return (
    <View style={styles.page}>
      <View style={[styles.screen, wide && styles.column]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, wide && styles.titleWide]}>Your chats</Text>
          <Text style={[styles.subtitle, wide && styles.subtitleWide]}>
            Kept on this {Platform.OS === "web" ? "browser" : "phone"} only — never uploaded.
          </Text>
        </View>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={[styles.list, wide && styles.column]}
        renderItem={({ item }) => <Row conversation={item} onOpen={onOpen} onDelete={() => remove(item.id)} wide={wide} />}
        ListEmptyComponent={<Text style={styles.empty}>No chats yet.</Text>}
      />
      </View>

      <VersionFooter />
    </View>
  );
}

function Row({
  conversation,
  onOpen,
  onDelete,
  wide,
}: {
  conversation: Conversation;
  onOpen: (id: string) => void;
  onDelete: () => void;
  wide: boolean;
}) {
  const last = conversation.messages[conversation.messages.length - 1];
  return (
    <Pressable
      onPress={() => onOpen(conversation.id)}
      style={({ hovered }: PressState) => [
        styles.row,
        wide && styles.rowWide,
        hovered && { backgroundColor: colors.textHover },
      ]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, wide && styles.rowTitleWide]} numberOfLines={1}>
          {conversation.title}
        </Text>
        <Text style={[styles.rowMeta, wide && styles.rowMetaWide]} numberOfLines={1}>
          {conversation.messages.length} message{conversation.messages.length === 1 ? "" : "s"} ·{" "}
          {formatWhen(conversation.updatedAt)}
          {last ? ` · ${last.content.replace(/\s+/g, " ").slice(0, 40)}` : ""}
        </Text>
      </View>
      <Pressable
        onPress={onDelete}
        hitSlop={8}
        style={({ hovered }: PressState) => [styles.delete, hovered && { backgroundColor: colors.textHover }]}
      >
        <Text style={[styles.deleteLabel, wide && styles.deleteLabelWide]}>Delete</Text>
      </Pressable>
    </Pressable>
  );
}

function formatWhen(ts: number): string {
  const d = new Date(ts);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

const styles = StyleSheet.create({
  // The same frame screen A uses: full-window bars, content at a readable
  // width, sized for the window rather than for a phone held at arm's length.
  column: { width: "100%", maxWidth: WIDE_COLUMN, alignSelf: "center", paddingHorizontal: 40 },
  page: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1, paddingHorizontal: 22, paddingTop: 24 },
  titleWide: { fontSize: 34 },
  subtitleWide: { fontSize: 15.5, lineHeight: 25, marginTop: 10 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  headerText: { flex: 1 },
  title: { fontFamily: fonts.heading, fontSize: 24, color: colors.text, letterSpacing: -0.36 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.text55, marginTop: 6, lineHeight: 19 },
  list: { paddingBottom: 24 },
  rowWide: { paddingVertical: 20 },
  rowTitleWide: { fontSize: 17.5 },
  rowMetaWide: { fontSize: 13, marginTop: 5 },
  deleteLabelWide: { fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: colors.divider08,
  },
  rowText: { flex: 1 },
  rowTitle: { fontFamily: fonts.body, fontSize: 15, color: colors.text },
  rowMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.text40, marginTop: 3 },
  delete: { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 6 },
  deleteLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.text45 },
  empty: { fontFamily: fonts.body, fontSize: 13, color: colors.text40, textAlign: "center", marginTop: 32 },
});
