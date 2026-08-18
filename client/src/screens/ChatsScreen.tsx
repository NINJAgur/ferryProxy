import React from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { PressState } from "../components/pressState";
import { Conversation, useThreadStore } from "../state/threadStore";
import { colors, fonts } from "../theme";

interface ChatsScreenProps {
  onOpen: (id: string) => void;
  onNew: () => void;
}

export function ChatsScreen({ onOpen, onNew }: ChatsScreenProps) {
  const conversations = useThreadStore((s) => s.conversations);
  const remove = useThreadStore((s) => s.remove);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Your chats</Text>
          <Text style={styles.subtitle}>
            Kept on this {Platform.OS === "web" ? "browser" : "phone"} only — never uploaded.
          </Text>
        </View>
        <Pressable
          onPress={onNew}
          style={({ hovered }: PressState) => [styles.newBtn, hovered && { backgroundColor: colors.accentHover }]}
        >
          <Text style={styles.newLabel}>New</Text>
        </Pressable>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <Row conversation={item} onOpen={onOpen} onDelete={() => remove(item.id)} />}
        ListEmptyComponent={<Text style={styles.empty}>No chats yet.</Text>}
      />
    </View>
  );
}

function Row({
  conversation,
  onOpen,
  onDelete,
}: {
  conversation: Conversation;
  onOpen: (id: string) => void;
  onDelete: () => void;
}) {
  const last = conversation.messages[conversation.messages.length - 1];
  return (
    <Pressable
      onPress={() => onOpen(conversation.id)}
      style={({ hovered }: PressState) => [styles.row, hovered && { backgroundColor: colors.textHover }]}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {conversation.title}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
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
        <Text style={styles.deleteLabel}>Delete</Text>
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
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 22, paddingTop: 24 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  headerText: { flex: 1 },
  title: { fontFamily: fonts.heading, fontSize: 24, color: colors.text, letterSpacing: -0.36 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.text55, marginTop: 6, lineHeight: 19 },
  newBtn: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  newLabel: { fontFamily: fonts.heading, fontSize: 14, color: colors.accent },
  list: { paddingBottom: 24 },
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
