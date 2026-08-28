import { TEXT_SCALES, useAccessibilityStore } from "../../src/state/accessibilityStore";
import { colors, contrastLift } from "../../src/theme";

describe("accessibility defaults", () => {
  it("ships as the app already looked", () => {
    // The whole point of the section: someone who never opens it sees no change.
    const state = useAccessibilityStore.getState();
    expect(state.textSize).toBe("default");
    expect(state.highContrast).toBe(false);
    expect(TEXT_SCALES[state.textSize]).toBe(1);
  });

  it("keeps the design's proportions at every step", () => {
    // Multipliers, not fixed sizes — a heading stays larger than its body text.
    const steps = [TEXT_SCALES.default, TEXT_SCALES.large, TEXT_SCALES.larger, TEXT_SCALES.largest];
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(steps[0]).toBe(1);
  });
});

describe("high contrast", () => {
  it("lifts every faded grey the design uses", () => {
    const faded = [
      colors.text80, colors.text75, colors.text65, colors.text60,
      colors.text55, colors.text50, colors.text45, colors.text40, colors.text35,
    ];
    for (const shade of faded) {
      expect(contrastLift[shade]).toBeDefined();
      expect(opacityOf(contrastLift[shade])).toBeGreaterThan(opacityOf(shade));
    }
  });

  it("clears the readable floor for the worst of them", () => {
    // text40 at 12px is the meta line under every message, and is below WCAG AA.
    expect(opacityOf(contrastLift[colors.text40])).toBeGreaterThanOrEqual(0.75);
    expect(opacityOf(contrastLift[colors.text35])).toBeGreaterThanOrEqual(0.75);
  });

  it("keeps the ranking the design intended", () => {
    // Lifted, not flattened: what was fainter stays fainter.
    expect(opacityOf(contrastLift[colors.text35])).toBeLessThan(opacityOf(contrastLift[colors.text80]));
  });

  it("leaves a colour it does not know alone", () => {
    expect(contrastLift[colors.accent]).toBeUndefined();
  });
});

function opacityOf(rgba: string): number {
  const match = rgba.match(/,\s*([0-9.]+)\s*\)$/);
  if (!match) throw new Error(`not an rgba colour: ${rgba}`);
  return Number(match[1]);
}
