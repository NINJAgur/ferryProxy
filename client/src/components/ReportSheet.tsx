import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";

import { Text } from "./AppText";
import { PressState } from "./pressState";
import { Button } from "./Button";
import { reportAnswer } from "../transport/httpClient";
import { colors, fonts, radius } from "../theme";

/**
 * Reporting an answer, without leaving the app.
 *
 * Play requires this of anything that generates content with AI, and requires
 * that the reports go somewhere that can act on them — so this posts the answer
 * itself to the relay rather than opening a mail client and hoping.
 *
 * Every reason maps to something that could actually be changed: a prompt, a
 * model, or a provider. "Something else" is last because a list of five that
 * someone reads beats a list of twelve they scroll past.
 */
const REASONS: { key: string; label: string }[] = [
  { key: "offensive", label: "Offensive or hateful" },
  { key: "harmful", label: "Dangerous or harmful" },
  { key: "sexual", label: "Sexually explicit" },
  { key: "false", label: "Wrong or misleading" },
  { key: "other", label: "Something else" },
];

interface ReportSheetProps {
  visible: boolean;
  answer: string;
  model?: string;
  onClose: () => void;
}

export function ReportSheet({ visible, answer, model, onClose }: ReportSheetProps) {
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(reason: string): Promise<void> {
    setBusy(true);
    setFailed(false);
    try {
      await reportAnswer(reason, answer, model);
      setSent(true);
    } catch {
      // A report that could not be sent is worth saying so about: silently
      // thanking someone for a complaint that never arrived is worse than
      // admitting the line dropped.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function close(): void {
    setSent(false);
    setFailed(false);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close">
        {/* Stops a tap inside the card closing it on the way through. */}
        <Pressable style={styles.card} onPress={() => {}}>
          {sent ? (
            <>
              <Text style={styles.title}>Thank you.</Text>
              <Text style={styles.note}>
                The answer has been sent for review. Reports like this are what the model
                filtering gets changed from.
              </Text>
              <Button label="Close" onPress={close} />
            </>
          ) : (
            <>
              <Text style={styles.title}>Report this answer</Text>
              <Text style={styles.note}>
                Ferry does not write answers — they come from Anthropic, OpenAI or Google.
                Telling us what went wrong is how the bad ones get filtered out.
              </Text>

              {REASONS.map((reason) => (
                <Pressable
                  key={reason.key}
                  onPress={() => void send(reason.key)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={reason.label}
                  style={({ hovered }: PressState) => [
                    styles.reason,
                    hovered && !busy && { backgroundColor: colors.textHover },
                    busy && styles.reasonBusy,
                  ]}
                >
                  <Text style={styles.reasonLabel}>{reason.label}</Text>
                </Pressable>
              ))}

              {failed ? <Text style={styles.failed}>Couldn't send that. Try again in a moment.</Text> : null}
              <Button label="Cancel" variant="ghost" onPress={close} />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral800,
    padding: 20,
    gap: 6,
  },
  title: { fontFamily: fonts.heading, fontSize: 17, color: colors.text },
  note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19.5, color: colors.text55, marginBottom: 8 },
  reason: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral800,
    minHeight: 44,
    justifyContent: "center",
  },
  reasonBusy: { opacity: 0.5 },
  reasonLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.text },
  failed: { fontFamily: fonts.body, fontSize: 12.5, color: colors.danger, marginTop: 4 },
});
