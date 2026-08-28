import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";

import { useAccessibilityStore } from "./state/accessibilityStore";

/**
 * How Ferry moves, and when it does not.
 *
 * Motion here has one job: an app that waits a long time on purpose should show
 * that it is alive and that something arrived, rather than snapping between two
 * still frames. Everything is short — a wait of forty seconds is not improved by
 * a flourish at the end of it.
 *
 * Built on React Native's own Animated rather than Reanimated: Reanimated 4.6
 * wants worklets 0.12 and expo-modules-core accepts 0.10, which broke the Android
 * build outright the last time it was tried. Animated needs no native module and
 * runs these on the UI thread through the native driver anyway.
 */
export const DURATION = {
  /** Something arriving. Long enough to be seen as movement, short enough not to
   *  be waited through. */
  enter: 300,
  /** One breath of the waiting pulse. */
  pulse: 900,
  /** A press acknowledging itself. Must not outlast the finger. */
  press: 90,
  /** A switch moving between its two states. */
  toggle: 160,
};

/** How far an arriving message rises as it fades in. Small on purpose: this is a
 *  hint that something is new, not a transition to sit through. */
export const ENTER_RISE = 10;

/**
 * Whether to animate at all.
 *
 * Two sources, either of which is a no: the app's own setting, and the one the
 * person already set for every app on their device. Someone who turned motion
 * off in the OS because it makes them ill should not have to find it again here.
 */
export function useMotion(): boolean {
  const reduceMotion = useAccessibilityStore((s) => s.reduceMotion);
  const setReduceMotion = useAccessibilityStore((s) => s.setReduceMotion);
  const askedSystem = useRef(false);

  useEffect(() => {
    // Asked once, and only allowed to turn motion off — so the OS preference is
    // honoured on first run without overriding a choice made here afterwards.
    if (askedSystem.current) return;
    askedSystem.current = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((system) => {
        if (system) setReduceMotion(true);
      })
      .catch(() => {
        // Not knowing is not a reason to stop the app animating.
      });
  }, [setReduceMotion]);

  return !reduceMotion;
}

/**
 * Fade and rise, once, when something appears.
 *
 * Returns a style rather than a component so a caller keeps its own layout —
 * a message bubble is already a careful stack of views and should not have
 * another one wrapped around it.
 */
export function useEnter(enabled: boolean): { opacity: Animated.Value; transform: [{ translateY: Animated.Value }] } {
  const progress = useRef(new Animated.Value(enabled ? 0 : 1)).current;

  useEffect(() => {
    if (!enabled) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION.enter,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [enabled, progress]);

  return {
    opacity: progress,
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [ENTER_RISE, 0],
        }) as unknown as Animated.Value,
      },
    ],
  };
}

/**
 * A slow breath, for the screen someone stares at while waiting.
 *
 * Opacity rather than scale: a card that changes size while you read the elapsed
 * time inside it is worse than one that does not move at all.
 */
export function usePulse(enabled: boolean): Animated.Value {
  const value = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!enabled) {
      value.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 0.3,
          duration: DURATION.pulse,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 1,
          duration: DURATION.pulse,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, value]);

  return value;
}

/**
 * A press that acknowledges itself.
 *
 * The caller puts this on a plain Animated.View wrapped around its Pressable,
 * never on the Pressable itself: a Pressable computes its style from a callback,
 * and Animated cannot look inside a function to find the value it is supposed to
 * be driving — it passes the transform through raw and the layout collapses.
 */
export function usePressScale(enabled: boolean): {
  scale: Animated.Value;
  onPressIn: () => void;
  onPressOut: () => void;
} {
  const scale = useRef(new Animated.Value(1)).current;

  const to = (toValue: number) => () => {
    if (!enabled) return;
    Animated.timing(scale, {
      toValue,
      duration: DURATION.press,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  return { scale, onPressIn: to(0.97), onPressOut: to(1) };
}

/**
 * A value that eases to wherever it is told, for a switch that slides between
 * its two states instead of jumping.
 */
export function useSpringTo(target: number, enabled: boolean): Animated.Value {
  const value = useRef(new Animated.Value(target)).current;

  useEffect(() => {
    if (!enabled) {
      value.setValue(target);
      return;
    }
    Animated.timing(value, {
      toValue: target,
      duration: DURATION.toggle,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [target, enabled, value]);

  return value;
}
