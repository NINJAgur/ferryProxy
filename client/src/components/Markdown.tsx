import React from "react";
import { StyleSheet, Text, TextStyle, View } from "react-native";

import { colors, fonts, fontsFor } from "../theme";

/** Minimal renderer for the subset of markdown the models actually return here:
 *  `**bold**` spans, `## headings`, and `1.`/`-` list items. */
export function Markdown({ text, style }: { text: string; style?: TextStyle }) {
  const blocks = text.split(/\n\n+/);
  return (
    <View style={styles.wrap}>
      {blocks.map((block, i) => {
        // Per block rather than per answer: a model asked in Hebrew often
        // replies with a paragraph of English in the middle of it.
        const family = fontsFor(block);
        const heading = block.match(/^#{1,3}\s+(.*)$/);
        if (heading) {
          return (
            <Text key={i} selectable style={[styles.heading, { fontFamily: family.heading }, style]}>
              {heading[1]}
            </Text>
          );
        }
        return (
          // An answer is the thing worth copying out of this app.
          <Text key={i} selectable style={[styles.para, { fontFamily: family.body }, style]}>
            {renderInline(block, family.headingSemi)}
          </Text>
        );
      })}
    </View>
  );
}

function renderInline(text: string, bold: string): React.ReactNode[] {
  // Split on **bold**, keeping the captured inner text.
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <Text key={i} style={{ fontFamily: bold }}>
        {part}
      </Text>
    ) : (
      <Text key={i}>{part}</Text>
    )
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  // auto, not left: a paragraph is aligned by its own first letter, so a Hebrew
  // answer reads from the right and an English one in the same chat does not move.
  para: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text, textAlign: "auto" },
  heading: { fontFamily: fonts.heading, fontSize: 15, lineHeight: 21, color: colors.text, textAlign: "auto" },
});
