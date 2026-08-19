import React from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FadingRule } from "../components/FadingRule";
import { PressState } from "../components/pressState";
import { Toggle } from "../components/Toggle";
import { Button } from "../components/Button";
import { chatFileLocation } from "../state/fileStorage";
import { useSessionStore } from "../state/sessionStore";
import { CHAT_FILE } from "../state/threadStore";
import { SettingsValues, useSettingsStore } from "../state/settingsStore";
import { colors, fonts } from "../theme";

const SETTINGS: { key: keyof SettingsValues; label: string; note: string }[] = [
  {
    key: "answerShortFirst",
    label: "Answer short first",
    note: "You get the gist in seconds, the detail after — if you still want it.",
  },
  {
    key: "sendWhenLineAppears",
    label: "Send when a line appears",
    note: "Anything you wrote offline goes out on its own.",
  },
  { key: "keepTryingQuietly", label: "Keep trying quietly", note: "Ferry retries twice before it bothers you." },
  {
    key: "warnBeforeLongAnswers",
    label: "Warn me before long answers",
    note: "Anything over a minute asks first.",
  },
];

export function SettingsScreen() {
  const settings = useSettingsStore();
  const session = useSessionStore();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>How Ferry behaves</Text>
        <Text style={styles.subtitle}>
          On a weak line, being brief is the whole trick. These are the choices that matter.
        </Text>

        <View style={styles.list}>
          {SETTINGS.map((row) => (
            <Pressable
              key={row.key}
              onPress={() => settings.setSetting(row.key, !settings[row.key])}
              style={({ hovered }: PressState) => [styles.row, hovered && { backgroundColor: colors.textHover }]}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowNote}>{row.note}</Text>
              </View>
              <Toggle value={settings[row.key]} />
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Your plan</Text>
        <Text style={styles.sectionNote}>
          {session.subscribed
            ? "Subscribed — every model is included."
            : "Gemini is included free. Claude and GPT are billed per answer, so they come with a subscription."}
        </Text>
        {session.models.map((m) => (
          <View key={m.name} style={styles.connRow}>
            <Text style={[styles.connLabel, !m.unlocked && styles.connLabelLocked]}>{m.label}</Text>
            <Text style={[styles.connStatus, !m.unlocked && styles.connStatusOff]}>
              {m.unlocked
                ? "included"
                : m.reason === "needs_subscription"
                  ? "with a subscription"
                  : "not available"}
            </Text>
          </View>
        ))}
        {!session.subscribed && session.models.some((m) => m.reason === "needs_subscription") ? (
          <View style={styles.planAction}>
            <Button label="Subscribe" onPress={() => void session.subscribe()} height={44} fontSize={14} />
          </View>
        ) : null}
        <Text style={styles.storageNote}>
          Ferry holds the model accounts. There are no API keys to manage here, and none is ever
          stored on this device.
        </Text>

        <Text style={styles.sectionTitle}>Where your data lives</Text>
        <Text style={styles.sectionNote}>
          Chats are written to a file on this {Platform.OS === "web" ? "browser" : "device"}, not to
          cache the system can clear. Nothing is uploaded — the relay sees a prompt long enough to
          answer it and keeps no conversation of its own, only a few minutes of the answer's pieces
          so a dropped one can be re-fetched.
        </Text>
        <Text style={styles.pathNote} selectable>
          {chatFileLocation(CHAT_FILE)}
        </Text>

        <View style={styles.spacer} />
      </ScrollView>
      <View style={styles.footer}>
        <FadingRule inset={40} />
        <Text style={styles.footerText}>Ferry 0.4 · Slow but steady</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: 22, paddingTop: 24 },
  title: { fontFamily: fonts.heading, fontSize: 24, color: colors.text, marginBottom: 8, letterSpacing: -0.36 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.text55, marginBottom: 24, maxWidth: 270, lineHeight: 20 },
  list: { gap: 2 },
  row: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
    paddingVertical: 15,
    paddingHorizontal: 2,
    borderTopWidth: 1,
    borderTopColor: colors.divider08,
  },
  rowText: { flex: 1 },
  rowLabel: { fontFamily: fonts.body, fontSize: 14.5, color: colors.text },
  rowNote: { fontFamily: fonts.body, fontSize: 12, color: colors.text45, marginTop: 3, lineHeight: 17.4 },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.text, marginTop: 28, marginBottom: 6 },
  sectionNote: { fontFamily: fonts.body, fontSize: 12, color: colors.text45, lineHeight: 18, marginBottom: 6 },
  connRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: colors.divider08,
  },
  connLabel: { fontFamily: fonts.body, fontSize: 14.5, color: colors.text },
  connLabelLocked: { color: colors.text55 },
  planAction: { marginTop: 12 },
  connStatus: { fontFamily: fonts.body, fontSize: 12, color: colors.accent400 },
  connStatusOff: { color: colors.text40 },
  storageNote: { fontFamily: fonts.body, fontSize: 11.5, color: colors.text40, marginTop: 12, lineHeight: 17 },
  pathNote: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.text40,
    marginTop: 8,
    lineHeight: 15,
  },
  spacer: { height: 28 },
  footer: { paddingHorizontal: 22, paddingBottom: 24 },
  footerText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.text35, marginTop: 14 },
});
