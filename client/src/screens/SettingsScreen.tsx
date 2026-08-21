import React from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { FadingRule } from "../components/FadingRule";
import { PressState } from "../components/pressState";
import { Toggle } from "../components/Toggle";
import { Button } from "../components/Button";
import { groupByProvider, groupUnlocked, PROVIDER_NAME, providerStatus } from "../modelGroups";
import { chatFileLocation } from "../state/fileStorage";
import { useEntitlementStore } from "../state/entitlementStore";
import { buyAddOn, restorePurchases } from "../billing";
import { CHAT_FILE, useThreadStore } from "../state/threadStore";
import { useMetricsStore } from "../state/metricsStore";
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

/** Deleting someone's conversations should take a deliberate second step. */
function confirmThen(question: string, action: () => void): void {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (window.confirm(question)) action();
    return;
  }
  Alert.alert(question, "This cannot be undone.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: action },
  ]);
}

/** The relay decides what a receipt is worth, so a purchase ends in a reload. */
async function purchase(step: () => Promise<{ receipt: string | null }>): Promise<void> {
  const { receipt } = await step();
  if (receipt) await useEntitlementStore.getState().load(receipt);
}

export function SettingsScreen() {
  const settings = useSettingsStore();
  const entitlement = useEntitlementStore();
  const clearChats = useThreadStore((t) => t.clearAll);
  const clearMetrics = useMetricsStore((m) => m.clear);

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
          {entitlement.unlocked
            ? "Unlocked — every model is included."
            : "Gemini Flash is free. Claude and GPT are billed per answer, so they come with a one-off purchase."}
        </Text>
        {/* By provider, not by version: the version is chosen in the chat. */}
        {groupByProvider(entitlement.models).map((g) => (
          <View key={g.provider} style={styles.connRow}>
            <Text style={[styles.connLabel, !groupUnlocked(g) && styles.connLabelLocked]}>
              {PROVIDER_NAME[g.provider]}
            </Text>
            <Text style={[styles.connStatus, !groupUnlocked(g) && styles.connStatusOff]}>
              {providerStatus(g)}
            </Text>
          </View>
        ))}
        {entitlement.unlocked ? (
          <Text style={styles.storageNote}>
            {entitlement.capped
              ? `You've used all ${entitlement.answersAllowed} answers your purchase included. Gemini Flash carries on free.`
              : `${entitlement.answersAllowed - entitlement.answersUsed} of ${entitlement.answersAllowed} answers left.`}
          </Text>
        ) : null}
        <View style={styles.planAction}>
          {!entitlement.unlocked && entitlement.models.some((m) => !m.unlocked) ? (
            <Button
              label="Unlock all models"
              onPress={() => void purchase(buyAddOn)}
              height={44}
              fontSize={14}
            />
          ) : null}
          {/* Always available: the stores require it, and it is how someone
              recovers an entitlement that did not come back on its own. */}
          <Button
            label="Restore purchases"
            onPress={() => void purchase(restorePurchases)}
            variant="ghost"
            height={44}
            fontSize={14}
          />
        </View>
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
        <View style={styles.dangerRow}>
          <Pressable
            onPress={() => confirmThen("Delete every chat on this device?", clearChats)}
            style={({ hovered }: PressState) => [styles.danger, hovered && { backgroundColor: colors.textHover }]}
          >
            <Text style={styles.dangerLabel}>Delete all chats</Text>
          </Pressable>
          <Pressable
            onPress={() => confirmThen("Clear the bandwidth history?", clearMetrics)}
            style={({ hovered }: PressState) => [styles.danger, hovered && { backgroundColor: colors.textHover }]}
          >
            <Text style={styles.dangerLabel}>Clear bandwidth history</Text>
          </Pressable>
        </View>

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
  dangerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  danger: {
    borderWidth: 1,
    borderColor: colors.neutral800,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  dangerLabel: { fontFamily: fonts.body, fontSize: 12.5, color: colors.danger },
  spacer: { height: 28 },
  footer: { paddingHorizontal: 22, paddingBottom: 24 },
  footerText: { fontFamily: fonts.body, fontSize: 11.5, color: colors.text35, marginTop: 14 },
});
