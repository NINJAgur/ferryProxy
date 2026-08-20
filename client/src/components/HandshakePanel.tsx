import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { groupByProvider, groupUnlocked, PROVIDER_NAME, providerStatus } from "../modelGroups";
import { EntitlementPhase } from "../state/entitlementStore";
import { colors, fonts } from "../theme";
import { ModelInfo } from "../transport/types";
import { Button } from "./Button";
import { FadingRule } from "./FadingRule";

export type CheckState = "pending" | "ok" | "failed";

interface HandshakePanelProps {
  network: CheckState;
  relay: CheckState;
  phase: EntitlementPhase;
  unlocked: boolean;
  models: ModelInfo[];
  error: string | null;
  /** What the last purchase or restore did, success or failure. */
  note: string | null;
  busy: boolean;
  onUnlock: () => void;
  onRestore: () => void;
  onRetry: () => void;
  onContinue: () => void;
}


export function HandshakePanel({
  network,
  relay,
  phase,
  unlocked: purchased,
  models,
  error,
  note,
  busy,
  onUnlock,
  onRestore,
  onRetry,
  onContinue,
}: HandshakePanelProps) {
  const working = busy || phase === "loading";
  // One row per provider, never one per version. This screen answers "what can I
  // reach"; the version is chosen in the chat, next to what it affects.
  const groups = groupByProvider(models);
  const unlocked = groups.filter(groupUnlocked);
  const locked = groups.filter((g) => !groupUnlocked(g));

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>FERRY</Text>
      <Text style={styles.headline}>{headline(phase)}</Text>
      <Text style={styles.subtitle}>{subtitle(phase, purchased)}</Text>

      {/* Every row is a real check with a real failure state — an unfinished
          check and a failed one must not look the same. */}
      <View style={styles.checklist}>
        <CheckRow
          state={network}
          label="This device has a network"
          failed="No network — Ferry can't reach anything"
        />
        <FadingRule inset={24} />
        <CheckRow
          state={relay}
          label="The Ferry server answered"
          failed="Ferry's server isn't reachable — it runs separately, not on this device"
        />
        <FadingRule inset={24} />
        <CheckRow
          state={phase === "ready" ? "ok" : phase === "failed" ? "failed" : "pending"}
          label="Found the models you can use"
          failed="Couldn't work out which models are available"
        />
      </View>

      {working ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.busyText}>Working out which models you can use…</Text>
        </View>
      ) : null}

      {phase === "ready" ? (
        <>
          <Text style={styles.sectionTitle}>Your models</Text>
          {unlocked.map((g) => (
            <View key={g.provider} style={styles.modelRow}>
              <View style={styles.tick}>
                <Text style={styles.tickMark}>✓</Text>
              </View>
              <Text style={styles.modelName}>{PROVIDER_NAME[g.provider]}</Text>
              <Text style={styles.modelNote}>{providerStatus(g)}</Text>
            </View>
          ))}
          {locked.map((g) => (
            <View key={g.provider} style={styles.modelRow}>
              <View style={styles.lockCircle} />
              <Text style={[styles.modelName, styles.modelNameLocked]}>
                {PROVIDER_NAME[g.provider]}
              </Text>
              <Text style={styles.modelNote}>{providerStatus(g)}</Text>
            </View>
          ))}

          {/* Restore is always reachable, even once unlocked: both stores require
              it, and someone whose entitlement did not come back needs a way to
              ask for it. Only the offer to buy disappears after buying. */}
          <View style={styles.upsell}>
            {!purchased && locked.length > 0 ? (
              <>
                <Text style={styles.upsellText}>
                  The stronger models are billed per answer, so they come with a one-off purchase.
                  Gemini Flash stays free either way.
                </Text>
                <Button
                  label="Unlock all models"
                  onPress={onUnlock}
                  disabled={working}
                  height={48}
                  fontSize={15}
                />
              </>
            ) : null}
            <Button
              label="Restore purchases"
              onPress={onRestore}
              disabled={working}
              variant="ghost"
              height={44}
              fontSize={14}
            />
            {note ? <Text style={styles.note}>{note}</Text> : null}
            {!purchased ? (
              <Text style={styles.configNote}>
                Bought it already, or on a new phone? Restore brings it back — the store keeps the
                record, so there is no account to sign into.
              </Text>
            ) : null}
          </View>
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.spacer} />

      <View style={styles.actions}>
        {phase === "ready" ? (
          <Button label="Continue to chat" onPress={onContinue} height={48} fontSize={15} />
        ) : (
          <Button
            label="Try again"
            onPress={onRetry}
            disabled={working}
            height={48}
            fontSize={15}
          />
        )}
      </View>
    </View>
  );
}

function headline(phase: EntitlementPhase): string {
  if (phase === "ready") return "You're on.";
  if (phase === "failed") return "That didn't go through.";
  return "Finding you a line out.";
}

function subtitle(phase: EntitlementPhase, purchased: boolean): string {
  switch (phase) {
    case "ready":
      return purchased
        ? "Every model is unlocked. Ferry sends only what a thin line can carry, and picks the answer back up when it drops."
        : "Ferry carries questions and answers over a line too weak for a normal app — a bar of signal, a bad hotel wifi, an airport queue.";
    case "loading":
      return "This takes a moment on a thin line. You can put your phone away.";
    case "failed":
      return "Nothing was lost. Try again when you're ready.";
    default:
      return "Ferry sorts out the models for you.";
  }
}

function CheckRow({ state, label, failed }: { state: CheckState; label: string; failed: string }) {
  return (
    <View style={styles.row}>
      {state === "ok" ? (
        <View style={styles.tick}>
          <Text style={styles.tickMark}>✓</Text>
        </View>
      ) : state === "failed" ? (
        <View style={styles.cross}>
          <Text style={styles.crossMark}>!</Text>
        </View>
      ) : (
        <View style={styles.circlePending} />
      )}
      <Text
        style={[
          styles.rowLabel,
          state !== "ok" && styles.rowLabelMuted,
          state === "failed" && styles.rowLabelFailed,
        ]}
      >
        {state === "failed" ? failed : label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 26, paddingTop: 24, paddingBottom: 24 },
  brand: { fontFamily: fonts.headingSemi, fontSize: 10, letterSpacing: 1.6, color: colors.accent },
  headline: {
    fontFamily: fonts.heading,
    fontSize: 29,
    color: colors.text,
    marginTop: 14,
    marginBottom: 10,
    letterSpacing: -0.435,
  },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.text55, maxWidth: 290, lineHeight: 21.7 },
  checklist: { marginTop: 28, gap: 2 },
  row: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 13 },
  tick: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent900,
    alignItems: "center",
    justifyContent: "center",
  },
  tickMark: { color: colors.accent400, fontSize: 11, fontFamily: fonts.body },
  cross: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(239,68,68,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  crossMark: { color: colors.danger, fontSize: 11, fontFamily: fonts.headingSemi },
  circlePending: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.accent700 },
  rowLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.text, flex: 1 },
  rowLabelMuted: { color: colors.text55 },
  rowLabelFailed: { color: colors.danger },
  busyRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 20 },
  busyText: { fontFamily: fonts.body, fontSize: 13, color: colors.text55 },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.text, marginTop: 26, marginBottom: 4 },
  modelRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  lockCircle: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.neutral700 },
  modelName: { fontFamily: fonts.body, fontSize: 14, color: colors.text, flex: 1 },
  modelNameLocked: { color: colors.text55 },
  modelNote: { fontFamily: fonts.body, fontSize: 12, color: colors.text45 },
  upsell: { marginTop: 16, gap: 10 },
  upsellText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.text55, lineHeight: 18.75 },
  error: { fontFamily: fonts.body, fontSize: 12.5, color: colors.danger, marginTop: 18, lineHeight: 18 },
  note: { fontFamily: fonts.body, fontSize: 12.5, color: colors.accent400, lineHeight: 18 },
  configNote: { fontFamily: fonts.body, fontSize: 11.5, color: colors.text45, lineHeight: 17, marginTop: 4 },
  spacer: { height: 24 },
  actions: { gap: 10 },
});
