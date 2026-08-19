import React from "react";
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { colors, fonts, radius } from "../theme";
import { ModelInfo } from "../transport/types";
import { PressState } from "./pressState";

interface ModelPickerProps {
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  /** The relay's catalogue. A locked model is shown but cannot be chosen. */
  models: ModelInfo[];
}

/** The design system's `.seg` control, driven by the catalogue rather than a
 *  hardcoded list — the relay decides what exists and what is reachable. */
export function ModelPicker({ value, onChange, disabled, models }: ModelPickerProps) {
  if (models.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seg}>
      {models.map((model, index) => {
        const active = model.id === value;
        const locked = !model.unlocked;
        return (
          <Pressable
            key={model.id}
            onPress={() => onChange(model.id)}
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
              {model.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
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
