import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Provider } from "../transport/types";

interface ProviderOption {
  value: Provider;
  label: string;
}

const OPTIONS: ProviderOption[] = [
  { value: "anthropic", label: "Claude" },
  { value: "openai", label: "GPT" },
  { value: "gemini", label: "Gemini" },
];

interface ProviderSelectorProps {
  value: Provider;
  onChange: (provider: Provider) => void;
  disabled?: boolean;
}

export function ProviderSelector({ value, onChange, disabled }: ProviderSelectorProps) {
  return (
    <View style={styles.row}>
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            style={[styles.pill, active && styles.pillActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    backgroundColor: "#151b2c",
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  pill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 9,
    alignItems: "center",
  },
  pillActive: {
    backgroundColor: "#4f6bff",
  },
  label: {
    color: "#8a93a6",
    fontWeight: "600",
    fontSize: 13,
  },
  labelActive: {
    color: "#ffffff",
  },
});
