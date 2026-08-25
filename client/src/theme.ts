// Tokens transcribed from the Ferry design source (Nocturne design system).
// Do not "improve" these values — they are the design's source of truth.
export const colors = {
  bg: "#161826",
  surface: "#232532",
  card: "#1c1e2b",
  text: "#e9e9ed",
  accent: "#9184d9",

  neutral500: "#9397ab",
  neutral600: "#75798c",
  neutral700: "#595d6c",
  neutral800: "#3f424d",

  accent200: "#e7e5fe",
  accent300: "#d2cefd",
  accent400: "#b5abfc",
  accent700: "#5d5294",
  accent900: "#2b2741",
  danger: "#ef4444",

  // color-mix(in srgb, #e9e9ed X%, transparent)
  text80: "rgba(233,233,237,0.8)",
  text75: "rgba(233,233,237,0.75)",
  text65: "rgba(233,233,237,0.65)",
  text60: "rgba(233,233,237,0.6)",
  text55: "rgba(233,233,237,0.55)",
  text50: "rgba(233,233,237,0.5)",
  text45: "rgba(233,233,237,0.45)",
  text40: "rgba(233,233,237,0.4)",
  text35: "rgba(233,233,237,0.35)",
  divider: "rgba(233,233,237,0.16)",
  divider12: "rgba(233,233,237,0.12)",
  divider09: "rgba(233,233,237,0.09)",
  divider08: "rgba(233,233,237,0.08)",

  // Interaction tints — color-mix(accent 12%/22%) over the ground.
  accentHover: "rgba(145,132,217,0.12)",
  accentActive: "rgba(145,132,217,0.22)",
  textHover: "rgba(233,233,237,0.07)",
};

export const fonts = {
  heading: "Inter_500Medium",
  headingSemi: "Inter_600SemiBold",
  body: "Inter_400Regular",
  mono: "monospace",
};

/**
 * The same three weights, for Hebrew.
 *
 * Inter draws no Hebrew, so a Hebrew string asking for it falls back letter by
 * letter to whatever the platform keeps — another face, at another weight,
 * sitting beside the Latin around it. Assistant covers Hebrew and was drawn to
 * sit with a grotesque like this one.
 */
export const hebrewFonts = {
  heading: "Assistant_500Medium",
  headingSemi: "Assistant_600SemiBold",
  body: "Assistant_400Regular",
  mono: "monospace",
};

/** The Hebrew block. Escaped rather than literal so the test survives a file
 *  that gets re-saved in something other than UTF-8. */
const HEBREW = /[\u0590-\u05FF]/;

/**
 * Which family a given string wants.
 *
 * React Native takes one family name per string rather than the fallback list a
 * browser would resolve, so the choice has to be made where the text is — and
 * made per string, since one chat holds both languages.
 */
export function fontsFor(text: string): typeof fonts {
  return HEBREW.test(text) ? hebrewFonts : fonts;
}

/** Latin, Greek and Cyrillic — the letters with a left-to-right direction of
 *  their own. Digits and punctuation have none and decide nothing. Escaped for
 *  the same reason the block above is. */
const LTR_LETTER = /[A-Za-z\u00C0-\u024F\u0370-\u04FF]/;

/**
 * Whether a string reads right to left.
 *
 * The first letter with a direction of its own decides, which is the rule a
 * browser applies to dir="auto" — so a Hebrew paragraph with an English word in
 * it still reads from the right, and an English one is left alone. Android has
 * to be told the answer: it aligns a paragraph by the app's layout direction
 * rather than by the script in it, which puts a Hebrew answer hard against the
 * left edge whatever textAlign "auto" is supposed to mean.
 */
export function readsRightToLeft(text: string): boolean {
  const rtl = text.search(HEBREW);
  if (rtl < 0) return false;
  const ltr = text.search(LTR_LETTER);
  return ltr < 0 || rtl < ltr;
}

export const radius = { sm: 4, md: 8, lg: 14 };
