import React from "react";
import { StyleSheet, Text, TextStyle, View } from "react-native";

import { colors, fonts } from "../theme";

/** Minimal renderer for the subset of markdown the models actually return here:
 *  `**bold**` spans, `## headings`, and `1.`/`-` list items. */
export function Markdown({ text, style }: { text: string; style?: TextStyle }) {
  const blocks = text.split(/\n\n+/);
  return (
    <View style={styles.wrap}>
      {blocks.map((block, i) => {
        const heading = block.match(/^#{1,3}\s+(.*)$/);
        if (heading) {
          return (
            <Text key={i} style={[styles.heading, style]}>
              {heading[1]}
            </Text>
          );
        }
        return (
          <Text key={i} style={[styles.para, style]}>
            {renderInline(block)}
          </Text>
        );
      })}
    </View>
  );
}

function renderInline(text: string): React.ReactNode[] {
  // Split on **bold**, keeping the captured inner text.
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <Text key={i} style={styles.bold}>
        {part}
      </Text>
    ) : (
      <Text key={i}>{part}</Text>
    )
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  para: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text },
  heading: { fontFamily: fonts.heading, fontSize: 15, lineHeight: 21, color: colors.text },
  bold: { fontFamily: fonts.headingSemi },
});
