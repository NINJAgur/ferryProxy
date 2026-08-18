import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet } from "react-native";

import { colors } from "../theme";

/** Nocturne signature: rules fade to transparent at both ends instead of stopping cleanly. */
export function FadingRule({ inset = 24 }: { inset?: number }) {
  return (
    <LinearGradient
      colors={["transparent", colors.divider12, colors.divider12, "transparent"]}
      locations={[0, inset / 350, 1 - inset / 350, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.rule}
    />
  );
}

const styles = StyleSheet.create({
  rule: { height: 1, width: "100%" },
});
