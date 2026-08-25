import { fontsFor, hebrewFonts, readsRightToLeft } from "../src/theme";

// Escaped rather than literal, for the same reason theme.ts escapes the block.
const HEBREW = "\u05E9\u05DC\u05D5\u05DD";

describe("readsRightToLeft", () => {
  it("follows the first letter that has a direction, not the last", () => {
    expect(readsRightToLeft(HEBREW + " is hello")).toBe(true);
    expect(readsRightToLeft("hello is " + HEBREW)).toBe(false);
  });

  it("lets digits and punctuation pass without deciding", () => {
    expect(readsRightToLeft("1. " + HEBREW)).toBe(true);
    expect(readsRightToLeft("1. hello")).toBe(false);
  });

  it("leaves text with no letters at all alone", () => {
    expect(readsRightToLeft("")).toBe(false);
    expect(readsRightToLeft("123 — 456")).toBe(false);
  });

  it("picks the font off any Hebrew, even where direction does not turn", () => {
    expect(fontsFor("hello " + HEBREW).body).toBe(hebrewFonts.body);
    expect(readsRightToLeft("hello " + HEBREW)).toBe(false);
  });
});
