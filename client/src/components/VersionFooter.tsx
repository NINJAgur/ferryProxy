import React from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "./AppText";

import { useWide, WIDE_COLUMN } from "../layout";
import { colors, fonts } from "../theme";
import { versionLabel } from "../version";
import { FadingRule } from "./FadingRule";

/**
 * Which build this is, at the foot of every screen a tester might be looking at
 * when something goes wrong. Selectable, so it can be copied into a report
 * rather than squinted at and retyped.
 */
export function VersionFooter() {
  const wide = useWide();
  return (
    // The rule runs the width of the window like every other divider in the app;
    // the text inside it lines up with the content above rather than the edge.
    <View style={styles.footer}>
      <FadingRule inset={40} />
      <View style={[styles.inner, wide && styles.column]}>
        <Text style={styles.text} selectable>
          {versionLabel()} · Slow but steady
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { paddingBottom: 24 },
  inner: { paddingHorizontal: 22 },
  column: { width: "100%", maxWidth: WIDE_COLUMN, alignSelf: "center", paddingHorizontal: 40 },
  text: { fontFamily: fonts.body, fontSize: 11.5, color: colors.text35, marginTop: 14 },
});
