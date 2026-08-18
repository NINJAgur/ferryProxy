import React from "react";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";

import { PressState } from "./pressState";
import { colors, fonts, radius } from "../theme";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: "primary" | "ghost";
  disabled?: boolean;
  block?: boolean;
  height?: number;
  fontSize?: number;
  width?: number;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  block = true,
  height,
  fontSize,
  width,
  style,
}: ButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ hovered, pressed }: PressState) => [
        styles.base,
        isPrimary ? styles.primary : styles.ghost,
        block && styles.block,
        !!height && { height },
        !!width && { width },
        // .btn-primary:hover / :active — accent at 12% / 22%
        hovered && !disabled && { backgroundColor: colors.accentHover },
        pressed && !disabled && { backgroundColor: colors.accentActive },
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, !!fontSize && { fontSize }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "transparent",
    paddingVertical: 5.6,
    paddingHorizontal: 10.08,
  },
  block: { width: "100%" },
  primary: { borderColor: colors.accent },
  ghost: { paddingHorizontal: 2.8 },
  disabled: { opacity: 0.45 },
  label: {
    color: colors.accent,
    fontFamily: fonts.heading,
    fontSize: 14,
    lineHeight: 16.8,
    textAlign: "center",
  },
});
