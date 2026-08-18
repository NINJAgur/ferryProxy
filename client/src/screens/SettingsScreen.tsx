import React, { useEffect } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FadingRule } from "../components/FadingRule";
import { KeyField } from "../components/KeyField";
import { PressState } from "../components/pressState";
import { Toggle } from "../components/Toggle";
import { KEYED_PROVIDERS, useKeyStore } from "../state/keyStore";
import { SettingsValues, useSettingsStore } from "../state/settingsStore";
import { colors, fonts } from "../theme";
import { Provider, ProviderStatus } from "../transport/types";

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

const KEY_HELP: Record<string, string> = {
  anthropic: "console.anthropic.com — paid per token",
  openai: "platform.openai.com — paid per token",
  gemini: "aistudio.google.com/apikey — has a free tier",
};

export function SettingsScreen({ providers }: { providers: ProviderStatus[] }) {
  const settings = useSettingsStore();
  const { keys, load, setKey } = useKeyStore();

  useEffect(() => {
    void load();
  }, [load]);

  const labelFor = (p: Provider) => providers.find((x) => x.name === p)?.label ?? p;
  const relayHasKey = (p: Provider) => !!providers.find((x) => x.name === p)?.ready;

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

        <Text style={styles.sectionTitle}>Your API keys</Text>
        <Text style={styles.sectionNote}>
          A key here is yours: it is sent with your requests only, so the usage lands on your own
          account rather than the relay's. Without one, Ferry falls back to whatever key the relay
          itself has — which may be none.
        </Text>
        {KEYED_PROVIDERS.map((p) => (
          <KeyField
            key={p}
            provider={p}
            label={labelFor(p)}
            help={KEY_HELP[p] ?? ""}
            value={keys[p]}
            relayHasKey={relayHasKey(p)}
            onSave={(provider, value) => void setKey(provider, value)}
          />
        ))}
        <Text style={styles.storageNote}>
          {Platform.OS === "web"
            ? "In this browser preview keys sit in localStorage. On a phone they go to the OS keystore."
            : "Keys are held in the device keystore (Keychain on iOS, Keystore on Android), separate from your chats."}
        </Text>

        <Text style={styles.sectionTitle}>Where your data lives</Text>
        <Text style={styles.sectionNote}>
          Chats, bandwidth figures and these settings are stored on this{" "}
          {Platform.OS === "web" ? "browser" : "phone"} and are never uploaded. The relay sees a
          prompt long enough to answer it and keeps no conversation of its own — only a few minutes
          of the answer's pieces, so a dropped one can be re-fetched.
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
  storageNote: { fontFamily: fonts.body, fontSize: 11, color: colors.text40, marginTop: 10, lineHeight: 16 },
  spacer: { height: 28 },
  footer: { paddingHorizontal: 22, paddingBottom: 24 },
  footerText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.text35, marginTop: 14 },
});
