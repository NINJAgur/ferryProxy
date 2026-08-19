import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { SessionPhase } from "../state/sessionStore";
import { colors, fonts } from "../theme";
import { ModelAccess } from "../transport/types";
import { Button } from "./Button";
import { FadingRule } from "./FadingRule";

export type CheckState = "pending" | "ok" | "failed";

interface HandshakePanelProps {
  network: CheckState;
  relay: CheckState;
  phase: SessionPhase;
  email: string | null;
  subscribed: boolean;
  models: ModelAccess[];
  error: string | null;
  signInAvailable: boolean;
  onSignIn: () => void;
  onSubscribe: () => void;
  onContinue: () => void;
}

const REASON_TEXT: Record<ModelAccess["reason"], string> = {
  included: "included",
  needs_subscription: "with a subscription",
  unavailable: "not available right now",
};

export function HandshakePanel({
  network,
  relay,
  phase,
  email,
  subscribed,
  models,
  error,
  signInAvailable,
  onSignIn,
  onSubscribe,
  onContinue,
}: HandshakePanelProps) {
  const busy = phase === "signing_in" || phase === "loading_models";
  const unlocked = models.filter((m) => m.unlocked);
  const locked = models.filter((m) => !m.unlocked);

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>FERRY</Text>
      <Text style={styles.headline}>{headline(phase)}</Text>
      <Text style={styles.subtitle}>{subtitle(phase, email)}</Text>

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
          label={phase === "ready" ? `Signed in as ${email ?? ""}` : "Signed in"}
          failed="Sign-in didn't complete"
        />
      </View>

      {busy ? (
        <View style={styles.busyRow}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.busyText}>
            {phase === "signing_in" ? "Waiting for Google…" : "Working out which models you can use…"}
          </Text>
        </View>
      ) : null}

      {phase === "ready" ? (
        <>
          <Text style={styles.sectionTitle}>Your models</Text>
          {unlocked.map((m) => (
            <View key={m.name} style={styles.modelRow}>
              <View style={styles.tick}>
                <Text style={styles.tickMark}>✓</Text>
              </View>
              <Text style={styles.modelName}>{m.label}</Text>
              <Text style={styles.modelNote}>{REASON_TEXT[m.reason]}</Text>
            </View>
          ))}
          {locked.map((m) => (
            <View key={m.name} style={styles.modelRow}>
              <View style={styles.lockCircle} />
              <Text style={[styles.modelName, styles.modelNameLocked]}>{m.label}</Text>
              <Text style={styles.modelNote}>{REASON_TEXT[m.reason]}</Text>
            </View>
          ))}

          {!subscribed && locked.some((m) => m.reason === "needs_subscription") ? (
            <View style={styles.upsell}>
              <Text style={styles.upsellText}>
                Claude and GPT are billed per answer, so they come with a subscription. Gemini stays
                free either way.
              </Text>
              <Button label="Subscribe" onPress={onSubscribe} height={48} fontSize={15} />
            </View>
          ) : null}
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.spacer} />

      <View style={styles.actions}>
        {phase === "ready" ? (
          <Button label="Continue to chat" onPress={onContinue} height={48} fontSize={15} />
        ) : (
          <Button
            label={phase === "failed" ? "Try signing in again" : "Sign in with Google"}
            onPress={onSignIn}
            disabled={busy || !signInAvailable}
            height={48}
            fontSize={15}
          />
        )}
        {!signInAvailable && phase !== "ready" ? (
          <Text style={styles.configNote}>
            Sign-in isn't configured yet: add EXPO_PUBLIC_GOOGLE_CLIENT_ID to client/.env and
            GOOGLE_CLIENT_ID to server/.env.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function headline(phase: SessionPhase): string {
  if (phase === "ready") return "You're on.";
  if (phase === "failed") return "That didn't go through.";
  return "Finding you a line out.";
}

function subtitle(phase: SessionPhase, email: string | null): string {
  switch (phase) {
    case "ready":
      return `Signed in as ${email ?? "you"}. Ferry holds the model accounts — you never deal with keys.`;
    case "signing_in":
    case "loading_models":
      return "This takes a moment on a thin line. You can put your phone away.";
    case "failed":
      return "Nothing was lost. Try again when you're ready.";
    default:
      return "Sign in and Ferry sorts out the models for you.";
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
  configNote: { fontFamily: fonts.body, fontSize: 11.5, color: colors.text45, lineHeight: 17, marginTop: 4 },
  spacer: { height: 24 },
  actions: { gap: 10 },
});
