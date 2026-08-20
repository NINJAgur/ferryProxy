import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { groupByProvider, PROVIDER_NAME } from "../modelGroups";
import { colors, fonts, radius } from "../theme";
import { ModelInfo, Provider } from "../transport/types";
import { PressState } from "./pressState";

interface ModelPickerProps {
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
  /** The relay's catalogue. A locked model is shown but cannot be chosen. */
  models: ModelInfo[];
}

/**
 * Which model answers, in two steps: who makes it, then which version.
 *
 * One flat list stopped working once a provider offered several versions — they
 * differ by an order of magnitude in what an answer costs, so which one is in use
 * has to be visible rather than something the app picked quietly.
 */
export function ModelPicker({ value, onChange, disabled, models }: ModelPickerProps) {
  if (models.length === 0) return null;

  const groups = groupByProvider(models);
  const current = models.find((m) => m.id === value);
  const activeProvider = current?.provider ?? groups[0].provider;
  const variants = groups.find((g) => g.provider === activeProvider)?.models ?? [];

  /** Switching provider lands on something usable rather than a locked version. */
  const pickProvider = (provider: Provider) => {
    const group = groups.find((g) => g.provider === provider)?.models ?? [];
    const target = group.find((m) => m.unlocked) ?? group[0];
    if (target) onChange(target.id);
  };

  return (
    <View style={styles.stack}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seg}>
        {groups.map(({ provider, models: group }, index) => {
          const active = provider === activeProvider;
          const locked = !group.some((m) => m.unlocked);
          return (
            <Pressable
              key={provider}
              onPress={() => pickProvider(provider)}
              disabled={disabled || locked}
              style={({ hovered }: PressState) => [
                styles.opt,
                index > 0 && styles.optDivided,
                active && styles.optActive,
                !active && !locked && hovered && { backgroundColor: colors.textHover },
                (disabled || locked) && styles.disabled,
              ]}
            >
              <Text style={[styles.label, locked && styles.labelLocked, active && styles.labelActive]}>
                {PROVIDER_NAME[provider]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Only worth a second row when there is actually a choice to make. */}
      {variants.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.variants}>
          {variants.map((model) => {
            const active = model.id === value;
            const locked = !model.unlocked;
            return (
              <Pressable
                key={model.id}
                onPress={() => onChange(model.id)}
                disabled={disabled || locked}
                style={({ hovered }: PressState) => [
                  styles.chip,
                  active && styles.chipActive,
                  !active && !locked && hovered && { backgroundColor: colors.textHover },
                  (disabled || locked) && styles.disabled,
                ]}
              >
                <Text
                  style={[styles.chipLabel, locked && styles.labelLocked, active && styles.labelActive]}
                >
                  {model.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
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
  variants: { flexDirection: "row", gap: 6, alignSelf: "flex-start" },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral800,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accent900 },
  chipLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.text55 },
  disabled: { opacity: 0.45 },
  label: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
  labelActive: { color: colors.accent },
  labelLocked: { color: colors.text40 },
});
