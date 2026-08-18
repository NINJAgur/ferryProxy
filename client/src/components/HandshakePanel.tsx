import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../theme";
import { Button } from "./Button";
import { FadingRule } from "./FadingRule";

interface HandshakePanelProps {
  wifiJoined: boolean;
  reachedServer: boolean;
  providerReady: boolean;
  providerLabel: string;
  providerNeedsKey: boolean;
  /** Whether the relay has told us anything about providers yet. */
  providerKnown: boolean;
  providerHint?: string;
  onWriteWhileWaiting: () => void;
  onDismiss: () => void;
}

/** Says what is actually being checked: the relay's credential for this model.
 *  Nobody signs in from the phone — the key lives on the relay. Until the relay
 *  answers we don't know anything about the key, and must not claim it is missing. */
function providerRowLabel(label: string, ready: boolean, needsKey: boolean, known: boolean): string {
  if (!known) return "Asking the relay which model it can reach";
  if (!needsKey) return `${label} needs no key`;
  return ready ? `${label} key found on the relay` : `${label} key missing on the relay`;
}

export function HandshakePanel({
  wifiJoined,
  reachedServer,
  providerReady,
  providerLabel,
  providerNeedsKey,
  providerKnown,
  providerHint,
  onWriteWhileWaiting,
  onDismiss,
}: HandshakePanelProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.brand}>FERRY</Text>
      <Text style={styles.headline}>Finding you a line out.</Text>
      <Text style={styles.subtitle}>
        The line here is thin, so this takes a moment. You can put your phone away.
      </Text>

      {/* Each row is a real check, not a scripted animation: device connectivity,
          a health ping to the relay, and whether the relay holds a usable key. */}
      <View style={styles.checklist}>
        <ChecklistRow label="This device has a network" done={wifiJoined} />
        <FadingRule inset={24} />
        <ChecklistRow label="The Ferry relay answered" done={reachedServer} />
        <FadingRule inset={24} />
        <ChecklistRow label={providerRowLabel(providerLabel, providerReady, providerNeedsKey, providerKnown)} done={providerReady} />
      </View>

      {providerHint ? <Text style={styles.hint}>{providerHint}</Text> : null}

      <View style={styles.spacer} />

      <View style={styles.actions}>
        <Button label="Write a question while you wait" onPress={onWriteWhileWaiting} height={48} fontSize={15} />
        <Button label="Not now" onPress={onDismiss} variant="ghost" height={44} fontSize={14} />
      </View>
    </View>
  );
}

function ChecklistRow({ label, done }: { label: string; done: boolean }) {
  return (
    <View style={styles.row}>
      {done ? (
        <View style={styles.circleDone}>
          <Text style={styles.check}>✓</Text>
        </View>
      ) : (
        <View style={styles.circlePending} />
      )}
      <Text style={[styles.rowLabel, !done && styles.rowLabelPending]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 26, paddingTop: 24, paddingBottom: 24 },
  brand: { fontFamily: fonts.headingSemi, fontSize: 10, letterSpacing: 1.6, color: colors.accent },
  headline: {
    fontFamily: fonts.heading,
    fontSize: 29,
    color: colors.text,
    marginTop: 14,
    marginBottom: 10,
    letterSpacing: -0.435,
  },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: colors.text55, maxWidth: 250, lineHeight: 21.7 },
  checklist: { marginTop: 38, gap: 2 },
  row: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 13 },
  circleDone: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent900,
    alignItems: "center",
    justifyContent: "center",
  },
  circlePending: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.accent700 },
  check: { color: colors.accent400, fontSize: 11, fontFamily: fonts.body },
  rowLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  rowLabelPending: { color: colors.text55 },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.text45, marginTop: 18, lineHeight: 18 },
  spacer: { flex: 1, minHeight: 24 },
  actions: { gap: 10 },
});
