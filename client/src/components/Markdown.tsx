import React from "react";
import { StyleSheet, TextStyle } from "react-native";

import { Text } from "./AppText";

import { colors, fonts, fontsFor, readsRightToLeft } from "../theme";

/** Minimal renderer for the subset of markdown the models actually return here:
 *  `**bold**` spans, `## headings`, and `1.`/`-` list items.
 *
 *  One Text for the whole answer, not one per paragraph. Android selection cannot
 *  cross a view boundary — a gesture selects within a single TextView and stops —
 *  so an answer split into a view per block could only ever be copied a paragraph
 *  at a time, and broke exactly where a blank line was. Nesting instead of
 *  splitting makes the whole answer one view with rich spans in it, which is what
 *  every other assistant app does and the only shape that copies whole.
 *
 *  The cost is that direction is decided once, from the answer's own first strong
 *  letter, rather than per paragraph: alignment is a property of a block, and
 *  there is only one block now. An answer is nearly always written in one
 *  language, so this is right almost always — and being able to copy an answer at
 *  all is worth more than aligning the rare mixed one paragraph by paragraph.
 *  Faces are unaffected; fontFamily still applies per span. */
export function Markdown({ text, style }: { text: string; style?: TextStyle }) {
  const family = fontsFor(text);
  const rightToLeft = readsRightToLeft(text);
  const blocks = text.split(/\n\n+/);

  return (
    // An answer is the thing worth copying out of this app.
    <Text
      selectable
      style={[styles.para, { fontFamily: family.body }, rightToLeft && styles.rightToLeft, style]}
    >
      {blocks.map((block, i) => {
        const heading = block.match(/^#{1,3}\s+(.*)$/);
        return (
          <Text key={i}>
            {/* The blank line between paragraphs, which used to be a gap between
                two views and is now part of the text being selected. */}
            {i > 0 ? "\n\n" : null}
            {heading ? (
              <Text style={[styles.heading, { fontFamily: family.heading }]}>{heading[1]}</Text>
            ) : (
              renderInline(block, family.headingSemi)
            )}
          </Text>
        );
      })}
    </Text>
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
  // auto, not left: an answer is aligned by its own first letter, so a Hebrew
  // one reads from the right and an English one in the same chat does not move.
  para: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text, textAlign: "auto" },
  heading: { fontFamily: fonts.heading, fontSize: 15, color: colors.text },
  // Said outright for the answers auto gets wrong. Android reads "auto" as the
  // app's own direction and lays a Hebrew answer out against the left edge,
  // full stop and all; only an explicit right turns it around.
  rightToLeft: { textAlign: "right", writingDirection: "rtl" },
});
