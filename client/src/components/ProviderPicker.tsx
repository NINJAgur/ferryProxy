import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PressState } from "./pressState";
import { colors, fonts, radius } from "../theme";
import { ModelAccess, Provider } from "../transport/types";

const OPTIONS: { value: Provider; label: string }[] = [
  { value: "anthropic", label: "Claude" },
  { value: "openai", label: "GPT" },
  { value: "gemini", label: "Gemini" },
];

interface ProviderPickerProps {
  value: Provider;
  onChange: (provider: Provider) => void;
  disabled?: boolean;
  /** What this account may use. A locked model is shown but cannot be chosen. */
  models?: ModelAccess[];
}

/** The design system's `.seg` segmented control. */
export function ProviderPicker({ value, onChange, disabled, models }: ProviderPickerProps) {
  return (
    <View style={styles.seg}>
      {OPTIONS.map((option, index) => {
        const active = option.value === value;
        const access = models?.find((m) => m.name === option.value);
        const locked = !!models && !access?.unlocked;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled || locked}
            style={({ hovered }: PressState) => [
              styles.opt,
              index > 0 && styles.optDivided,
              active && styles.optActive,
              !active && !locked && hovered && { backgroundColor: colors.textHover },
              (disabled || locked) && styles.disabled,
            ]}
          >
            {/* Selection still wins visually, so the chosen model always reads as
                chosen; a locked one is greyed and simply cannot be selected. */}
            <Text style={[styles.label, locked && styles.labelLocked, active && styles.labelActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: {
    flexDirection: "row",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  opt: { paddingVertical: 7, paddingHorizontal: 12 },
  optDivided: { borderLeftWidth: 1, borderLeftColor: colors.divider },
  optActive: { borderWidth: 1, borderColor: colors.accent, margin: -1 },
  disabled: { opacity: 0.45 },
  label: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
  labelActive: { color: colors.accent },
  labelLocked: { color: colors.text40 },
});
