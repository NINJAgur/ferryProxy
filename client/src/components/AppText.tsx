import React, { useMemo } from "react";
import { StyleSheet, Text as RNText, TextProps, TextStyle } from "react-native";

import { useAccessibilityStore, useTextScale } from "../state/accessibilityStore";
import { contrastLift } from "../theme";

/**
 * The app's Text, sized and coloured by the accessibility settings.
 *
 * Every size in this app is a number written into a StyleSheet, which is fine
 * until someone cannot read it. Rather than thread a scale through a hundred of
 * them, the multiplication happens once, here, on the way to the real Text —
 * so a screen gets the setting by importing from this file instead of from
 * react-native, and nothing else about it changes.
 *
 * At the default setting the incoming style is passed through untouched. That is
 * deliberate: someone who never opens the accessibility section is looking at
 * exactly the app that shipped, down to the object identity of the style.
 */
export function Text(props: TextProps) {
  const scale = useTextScale();
  const highContrast = useAccessibilityStore((s) => s.highContrast);
  const style = useMemo(
    () => adjust(props.style, scale, highContrast),
    [props.style, scale, highContrast]
  );
  return <RNText {...props} style={style} />;
}

function adjust(style: TextProps["style"], scale: number, highContrast: boolean): TextProps["style"] {
  if (scale === 1 && !highContrast) return style;

  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  if (!flat) return style;

  const next: TextStyle = { ...flat };
  // lineHeight scales with the text or the lines close up as the letters grow,
  // which is harder to read at a large size than the small size it replaced.
  if (typeof flat.fontSize === "number") next.fontSize = flat.fontSize * scale;
  if (typeof flat.lineHeight === "number") next.lineHeight = flat.lineHeight * scale;
  if (highContrast && typeof flat.color === "string") {
    next.color = contrastLift[flat.color] ?? flat.color;
  }
  return next;
}
