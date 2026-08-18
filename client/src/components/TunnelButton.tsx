import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text } from "react-native";

import { ReassemblyStatus } from "../transport/reassemblyState";

interface TunnelButtonProps {
  state: ReassemblyStatus;
  onPress: () => void;
}

interface StateDisplay {
  label: string;
  color: string;
  pulsing: boolean;
}

function describeState(state: ReassemblyStatus): StateDisplay {
  switch (state.status) {
    case "idle":
      return { label: "Tap to send", color: "#4f6bff", pulsing: false };
    case "sending":
      return { label: "Sending…", color: "#4f6bff", pulsing: true };
    case "awaiting_chunks":
      return {
        label: `Receiving ${state.receivedCount}/${state.totalChunks}`,
        color: "#4f6bff",
        pulsing: true,
      };
    case "retrying":
      return { label: `Retrying (attempt ${state.attempt + 1})…`, color: "#f59e0b", pulsing: true };
    case "complete":
      return { label: "Done", color: "#22c55e", pulsing: false };
    case "failed":
      return { label: "Failed — tap to retry", color: "#ef4444", pulsing: false };
    default:
      return { label: "Tap to send", color: "#4f6bff", pulsing: false };
  }
}

const BUSY_STATUSES = new Set(["sending", "awaiting_chunks", "retrying"]);

export function TunnelButton({ state, onPress }: TunnelButtonProps) {
  const display = describeState(state);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!display.pulsing) {
      pulse.setValue(1);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [display.pulsing, pulse]);

  return (
    <Pressable onPress={onPress} disabled={BUSY_STATUSES.has(state.status)} testID="tunnel-button">
      <Animated.View style={[styles.ring, { borderColor: display.color, transform: [{ scale: pulse }] }]}>
        <Animated.View
          style={[
            styles.button,
            {
              backgroundColor: display.color,
              shadowColor: display.color,
            },
          ]}
        >
          <Text style={styles.label}>{display.label}</Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: 216,
    height: 216,
    borderRadius: 108,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    width: 188,
    height: 188,
    borderRadius: 94,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 30,
    elevation: 14,
  },
  label: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
});
