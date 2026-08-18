import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors, fonts } from "../theme";
import { Provider } from "../transport/types";
import { PressState } from "./pressState";

interface KeyFieldProps {
  provider: Provider;
  label: string;
  help: string;
  value?: string;
  relayHasKey: boolean;
  onSave: (provider: Provider, value: string) => void;
}

/** Shows only the last few characters of a saved key: enough to tell which key
 *  is in place, not enough to read it off someone's screen. */
function mask(key: string): string {
  return key.length <= 4 ? "••••" : `••••••••${key.slice(-4)}`;
}

export function KeyField({ provider, label, help, value, relayHasKey, onSave }: KeyFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!editing) setDraft("");
  }, [editing]);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.status, value ? styles.statusOwn : relayHasKey ? styles.statusRelay : styles.statusNone]}>
          {value ? "your key" : relayHasKey ? "relay's key" : "not set"}
        </Text>
      </View>

      {editing ? (
        <View style={styles.editRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={`Paste your ${label} key`}
            placeholderTextColor={colors.text40}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Pressable
            onPress={() => {
              onSave(provider, draft);
              setEditing(false);
            }}
            style={({ hovered }: PressState) => [styles.btn, hovered && { backgroundColor: colors.accentHover }]}
          >
            <Text style={styles.btnLabel}>Save</Text>
          </Pressable>
          <Pressable onPress={() => setEditing(false)} style={styles.btnGhost}>
            <Text style={styles.btnGhostLabel}>Cancel</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.editRow}>
          <Text style={styles.masked}>{value ? mask(value) : help}</Text>
          <Pressable
            onPress={() => setEditing(true)}
            style={({ hovered }: PressState) => [styles.btn, hovered && { backgroundColor: colors.accentHover }]}
          >
            <Text style={styles.btnLabel}>{value ? "Replace" : "Add"}</Text>
          </Pressable>
          {value ? (
            <Pressable onPress={() => onSave(provider, "")} style={styles.btnGhost}>
              <Text style={styles.btnGhostLabel}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.divider08 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontFamily: fonts.body, fontSize: 14.5, color: colors.text },
  status: { fontFamily: fonts.body, fontSize: 11 },
  statusOwn: { color: colors.accent400 },
  statusRelay: { color: colors.text45 },
  statusNone: { color: colors.text40 },
  editRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  input: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderColor: colors.neutral800,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 13,
  },
  masked: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.text45 },
  btn: { borderWidth: 1, borderColor: colors.accent, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  btnLabel: { fontFamily: fonts.heading, fontSize: 13, color: colors.accent },
  btnGhost: { paddingVertical: 7, paddingHorizontal: 8 },
  btnGhostLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.text45 },
});
