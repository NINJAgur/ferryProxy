import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PressState } from "./pressState";
import { colors, fonts, radius } from "../theme";
import { Provider } from "../transport/types";

const OPTIONS: { value: Provider; label: string }[] = [
  { value: "demo", label: "Demo" },
  { value: "anthropic", label: "Claude" },
  { value: "openai", label: "GPT" },
  { value: "gemini", label: "Gemini" },
];

interface ProviderPickerProps {
  value: Provider;
  onChange: (provider: Provider) => void;
  disabled?: boolean;
  /** Providers whose credentials the server reports as present. */
  readyNames?: Provider[];
}

/** The design system's `.seg` segmented control. */
export function ProviderPicker({ value, onChange, disabled, readyNames }: ProviderPickerProps) {
  return (
    <View style={styles.seg}>
      {OPTIONS.map((option, index) => {
        const active = option.value === value;
        const needsKey = !!readyNames && !readyNames.includes(option.value);
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            style={({ hovered }: PressState) => [
              styles.opt,
              index > 0 && styles.optDivided,
              active && styles.optActive,
              !active && hovered && { backgroundColor: colors.textHover },
              disabled && styles.disabled,
            ]}
          >
            <Text style={[styles.label, active && styles.labelActive, needsKey && styles.labelNeedsKey]}>
              {option.label}
              {needsKey ? " ·" : ""}
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
  labelNeedsKey: { color: colors.text45 },
});
