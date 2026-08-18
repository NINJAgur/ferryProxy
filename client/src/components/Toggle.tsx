import React from "react";
import { StyleSheet, View } from "react-native";

import { colors } from "../theme";

/** Track/knob values transcribed from the Ferry source's trackStyle/knobStyle. */
export function Toggle({ value }: { value: boolean }) {
  return (
    <View
      style={[
        styles.track,
        {
          justifyContent: value ? "flex-end" : "flex-start",
          backgroundColor: value ? colors.accent700 : colors.neutral800,
          borderColor: value ? colors.accent : colors.neutral700,
        },
      ]}
    >
      <View style={[styles.knob, { backgroundColor: value ? colors.accent300 : colors.neutral500 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 42,
    height: 25,
    borderRadius: 13,
    flexDirection: "row",
    padding: 2,
    marginTop: 2,
    borderWidth: 1,
  },
  knob: { width: 19, height: 19, borderRadius: 9.5 },
});
