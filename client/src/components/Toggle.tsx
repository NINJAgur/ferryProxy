import React from "react";
import { Animated, StyleSheet } from "react-native";

import { useMotion, useSpringTo } from "../motion";
import { colors } from "../theme";

/** Track/knob values transcribed from the Ferry source's trackStyle/knobStyle.
 *
 *  The knob slides rather than teleports, and the track's colours cross over with
 *  it. A switch is the one control whose whole job is to show a state changing,
 *  so it is the worst place in the app for the change to happen between frames.
 *
 *  Driven on the JS thread rather than natively: colour interpolation is not
 *  something the native driver can do, and one 160ms tween on a 42px switch is
 *  not what makes an app feel slow. */
export function Toggle({ value }: { value: boolean }) {
  const progress = useSpringTo(value ? 1 : 0, useMotion());

  return (
    <Animated.View
      style={[
        styles.track,
        {
          backgroundColor: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [colors.neutral800, colors.accent700],
          }),
          borderColor: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [colors.neutral700, colors.accent],
          }),
        },
      ]}
    >
      <Animated.View
        style={[
          styles.knob,
          {
            backgroundColor: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [colors.neutral500, colors.accent300],
            }),
            // The travel the old justifyContent flip used to do in one jump:
            // track width less its border, padding and the knob itself.
            transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 17] }) }],
          },
        ]}
      />
    </Animated.View>
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
