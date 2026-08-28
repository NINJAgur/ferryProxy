import React, { useEffect, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { Text } from "../components/AppText";
import {
  TEXT_SCALES,
  TEXT_SIZE_LABELS,
  TextSize,
  useAccessibilityStore,
} from "../state/accessibilityStore";

import { FadingRule } from "../components/FadingRule";
import { PressState } from "../components/pressState";
import { Toggle } from "../components/Toggle";
import { Button } from "../components/Button";
import { groupByProvider, groupUnlocked, PROVIDER_NAME, providerStatus } from "../modelGroups";
import { chatFileLocation } from "../state/fileStorage";
import { useEntitlementStore } from "../state/entitlementStore";
import { buyAddOn, restorePurchases } from "../billing";
import { CODE_PREFIX, rememberCode } from "../billing/restoreCode";
import { fetchRestoreCode } from "../transport/httpClient";
import { CHAT_FILE, useThreadStore } from "../state/threadStore";
import { useMetricsStore } from "../state/metricsStore";
import { SettingsValues, useSettingsStore } from "../state/settingsStore";
import { useWide, WIDE_COLUMN } from "../layout";
import { VersionFooter } from "../components/VersionFooter";
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
  const a11y = useAccessibilityStore();
  // Opening this screen is the moment the number matters, and it is a deliberate
  // act rather than something happening mid-conversation — so it is a fair place
  // to spend a request putting the count back in step with the relay.
  useEffect(() => {
    void useEntitlementStore.getState().load();
  }, []);

  const wide = useWide();
  // A purchase made in a browser has no store to ask "what did this person
  // buy?", so the buyer is given something to carry to their next device.
  const [code, setCode] = useState<string | null>(null);
  const [codeDraft, setCodeDraft] = useState("");
  const [codeNote, setCodeNote] = useState<string | null>(null);
  const settings = useSettingsStore();
  const entitlement = useEntitlementStore();
  const clearChats = useThreadStore((t) => t.clearAll);

  async function showCode(): Promise<void> {
    try {
      setCode(await fetchRestoreCode(entitlement.receipt ?? undefined));
    } catch {
      setCodeNote("Couldn't fetch a code. Try again in a moment.");
    }
  }

  async function applyCode(): Promise<void> {
    const tidy = codeDraft.trim().toUpperCase();
    if (!tidy) return;
    await rememberCode(tidy);
    await entitlement.load(`${CODE_PREFIX}${tidy}`);
    const worked = useEntitlementStore.getState().unlocked;
    setCodeNote(worked ? "Restored." : "That code doesn't match a purchase.");
  }
  const clearMetrics = useMetricsStore((m) => m.clear);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.container, wide && styles.column]}>
        <Text style={[styles.title, wide && styles.titleWide]}>How Ferry behaves</Text>
        <Text style={[styles.subtitle, wide && styles.subtitleWide]}>
          On a weak line, being brief is the whole trick. These are the choices that matter.
        </Text>

        <View style={styles.list}>
          {SETTINGS.map((row) => (
            <Pressable
              key={row.key}
              accessibilityRole="switch"
              accessibilityState={{ checked: settings[row.key] }}
              accessibilityLabel={row.label}
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

        <Text style={[styles.sectionTitle, wide && styles.sectionTitleWide]}>Reading and contrast</Text>
        <Text style={[styles.sectionNote, wide && styles.sectionNoteWide]}>
          These apply everywhere in the app — answers, buttons and labels together.
        </Text>

        <View style={styles.sizeRow} accessibilityRole="radiogroup" accessibilityLabel="Text size">
          {(Object.keys(TEXT_SIZE_LABELS) as TextSize[]).map((size) => {
            const active = a11y.textSize === size;
            return (
              <Pressable
                key={size}
                onPress={() => a11y.setTextSize(size)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Text size ${TEXT_SIZE_LABELS[size]}`}
                style={({ hovered }: PressState) => [
                  styles.sizePill,
                  active && styles.sizePillActive,
                  hovered && !active && { backgroundColor: colors.textHover },
                ]}
              >
                {/* Each option is drawn at the size it sets, so the choice is
                    made by reading it rather than by guessing what a word means. */}
                <Text
                  style={[
                    styles.sizePillLabel,
                    { fontSize: 13 * TEXT_SCALES[size] },
                    active && styles.sizePillLabelActive,
                  ]}
                >
                  {TEXT_SIZE_LABELS[size]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.list}>
          <Pressable
            onPress={() => a11y.setHighContrast(!a11y.highContrast)}
            accessibilityRole="switch"
            accessibilityState={{ checked: a11y.highContrast }}
            style={({ hovered }: PressState) => [styles.row, hovered && { backgroundColor: colors.textHover }]}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Stronger contrast</Text>
              <Text style={styles.rowNote}>
                Ferry greys out the less important text. This brings it back up to full strength.
              </Text>
            </View>
            <Toggle value={a11y.highContrast} />
          </Pressable>

          <Pressable
            onPress={() => a11y.setReduceMotion(!a11y.reduceMotion)}
            accessibilityRole="switch"
            accessibilityState={{ checked: a11y.reduceMotion }}
            accessibilityLabel="Less movement"
            style={({ hovered }: PressState) => [styles.row, hovered && { backgroundColor: colors.textHover }]}
          >
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Less movement</Text>
              <Text style={styles.rowNote}>
                Answers appear without fading in, and the waiting card stops pulsing.
              </Text>
            </View>
            <Toggle value={a11y.reduceMotion} />
          </Pressable>

        </View>

        <Text style={[styles.sectionTitle, wide && styles.sectionTitleWide]}>Your plan</Text>
        <Text style={[styles.sectionNote, wide && styles.sectionNoteWide]}>
          {entitlement.unlocked
            ? "Unlocked — every model is included."
            : `Gemini Flash is free. Pro opens Claude, GPT and Gemini Pro for one payment — ${entitlement.answersAllowed} answers to spend across them, with nothing to cancel.`}
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
          <Text style={[styles.storageNote, wide && styles.storageNoteWide]}>
            {entitlement.capped
              ? `You've used all ${entitlement.answersAllowed} answers your purchase included. Gemini Flash carries on free.`
              : `${entitlement.answersAllowed - entitlement.answersUsed} of ${entitlement.answersAllowed} answers left.`}
          </Text>
        ) : null}
        {entitlement.unlocked ? (
          <View style={styles.planAction}>
            {code ? (
              <>
                <Text style={[styles.sectionNote, wide && styles.sectionNoteWide]}>
                  Your restore code. Write it down — it is the only way to move this purchase
                  to another device or browser.
                </Text>
                <Text selectable style={styles.code}>{code}</Text>
              </>
            ) : (
              <View style={wide ? styles.control : undefined}>
                <Button
                  label="Show restore code"
                  onPress={() => void showCode()}
                  variant="ghost"
                  height={wide ? 46 : 44}
                  fontSize={wide ? 14.5 : 14}
                />
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.planAction, wide && styles.control]}>
            <Text style={[styles.sectionNote, wide && styles.sectionNoteWide]}>
              Bought Ferry Pro somewhere else? Enter the restore code you were given.
            </Text>
            <TextInput
              style={styles.codeInput}
              placeholder="ABCD-EFGH-JKLM"
              placeholderTextColor={colors.text40}
              value={codeDraft}
              onChangeText={setCodeDraft}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Button
              label="Use code"
              onPress={() => void applyCode()}
              variant="ghost"
              height={wide ? 46 : 44}
              fontSize={wide ? 14.5 : 14}
            />
          </View>
        )}
        {codeNote ? <Text style={styles.storageNote}>{codeNote}</Text> : null}

        <View style={styles.planAction}>
          {!entitlement.unlocked && entitlement.models.some((m) => !m.unlocked) ? (
            <View style={wide ? styles.control : undefined}>
              <Button
                label="Upgrade to Pro"
                onPress={() => void purchase(buyAddOn)}
                height={wide ? 50 : 44}
                fontSize={wide ? 15.5 : 14}
              />
            </View>
          ) : null}
          {/* Always available: the stores require it, and it is how someone
              recovers an entitlement that did not come back on its own. */}
          <View style={wide ? styles.control : undefined}>
            <Button
              label="Restore purchases"
              onPress={() => void purchase(restorePurchases)}
              variant="ghost"
              height={wide ? 46 : 44}
              fontSize={wide ? 14.5 : 14}
            />
          </View>
        </View>
        <Text style={[styles.storageNote, wide && styles.storageNoteWide]}>
          Ferry holds the model accounts. There are no API keys to manage here, and none is ever
          stored on this device.
        </Text>

        <Text style={[styles.sectionTitle, wide && styles.sectionTitleWide]}>Where your data lives</Text>
        <Text style={[styles.sectionNote, wide && styles.sectionNoteWide]}>
          Chats are written to a file on this {Platform.OS === "web" ? "browser" : "device"}, not to
          cache the system can clear. Nothing is uploaded — the relay sees a prompt long enough to
          answer it and keeps no conversation of its own, only a few minutes of the answer's pieces
          so a dropped one can be re-fetched.
        </Text>
        <View style={[styles.dangerRow, wide && styles.dangerRowWide]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete every chat on this device"
            onPress={() => confirmThen("Delete every chat on this device?", clearChats)}
            style={({ hovered }: PressState) => [styles.danger, hovered && { backgroundColor: colors.textHover }]}
          >
            <Text style={styles.dangerLabel}>Delete all chats</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear the bandwidth history"
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
      <VersionFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  // The same frame screen A uses: full-window bars, content at a readable
  // width, sized for the window rather than for a phone held at arm's length.
  column: { width: "100%", maxWidth: WIDE_COLUMN, alignSelf: "center", paddingHorizontal: 40 },
  screen: { flex: 1, backgroundColor: colors.bg },
  titleWide: { fontSize: 34, marginBottom: 12 },
  // The same centred width screen A uses, so a button means the same
  // thing wherever it appears.
  control: { width: "100%", maxWidth: 580, alignSelf: "center" },
  subtitleWide: { fontSize: 15.5, lineHeight: 25, maxWidth: 560, marginBottom: 32 },
  sectionTitleWide: { fontSize: 22, marginTop: 38, marginBottom: 8 },
  sectionNoteWide: { fontSize: 14, lineHeight: 22, maxWidth: 620 },
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
  sizeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, marginBottom: 12, flexWrap: "wrap" },
  sizePill: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.neutral800,
    minHeight: 44,
    justifyContent: "center",
  },
  sizePillActive: { borderColor: colors.accent, backgroundColor: colors.accent900 },
  sizePillLabel: { fontFamily: fonts.heading, color: colors.text65 },
  sizePillLabelActive: { color: colors.accent200 },
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
  planAction: { marginTop: 12, gap: 10 },
  code: { fontFamily: fonts.mono, fontSize: 18, color: colors.accent400, letterSpacing: 1.5 },
  codeInput: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.neutral800,
    borderRadius: 10,
    paddingHorizontal: 14,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 15,
  },
  connStatus: { fontFamily: fonts.body, fontSize: 12, color: colors.accent400 },
  connStatusOff: { color: colors.text40 },
  storageNote: { fontFamily: fonts.body, fontSize: 11.5, color: colors.text40, marginTop: 12, lineHeight: 17 },
  storageNoteWide: { fontSize: 13.5, lineHeight: 21, marginTop: 14 },
  pathNote: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.text40,
    marginTop: 8,
    lineHeight: 15,
  },
  dangerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  // Centred with the rest, so the screen has one column of controls.
  dangerRowWide: { alignSelf: "center", justifyContent: "center", gap: 12, marginTop: 20 },
  danger: {
    borderWidth: 1,
    borderColor: colors.neutral800,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  dangerLabel: { fontFamily: fonts.body, fontSize: 12.5, color: colors.danger },
  spacer: { height: 28 },
});
