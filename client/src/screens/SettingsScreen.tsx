import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FadingRule } from "../components/FadingRule";
import { Toggle } from "../components/Toggle";
import { SettingsValues, useSettingsStore } from "../state/settingsStore";
import { PressState } from "../components/pressState";
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
              style={({ hovered }: PressState) => [
                styles.row,
                hovered && { backgroundColor: colors.textHover },
              ]}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowNote}>{row.note}</Text>
              </View>
              <Toggle value={settings[row.key]} />
            </Pressable>
          ))}
        </View>

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
  spacer: { height: 24 },
  footer: { paddingHorizontal: 22, paddingBottom: 24 },
  footerText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.text35, marginTop: 14 },
});
