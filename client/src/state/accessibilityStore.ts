import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * How readable the app should be, for people the defaults do not serve.
 *
 * Everything here defaults to the app exactly as it was, so nobody who never
 * opens this section sees a change. The point is that someone who cannot read
 * 12px at 40% opacity is not required to give up on the app.
 */
export type TextSize = "default" | "large" | "larger" | "largest";

/** Multipliers, not absolute sizes: the design's own proportions survive, so a
 *  heading stays larger than the body text it sits above at every step. */
export const TEXT_SCALES: Record<TextSize, number> = {
  default: 1,
  large: 1.15,
  larger: 1.3,
  largest: 1.5,
};

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  default: "Default",
  large: "Large",
  larger: "Larger",
  largest: "Largest",
};

interface AccessibilityState {
  textSize: TextSize;
  /** Lifts the faded greys to full strength. The design uses opacity to rank
   *  information, which reads as elegant to someone who can see it and as
   *  missing to someone who cannot. */
  highContrast: boolean;
  /** Stops the fades, rises and pulses. Set from the device's own reduce-motion
   *  preference on first run, and overridable here afterwards. */
  reduceMotion: boolean;
  setTextSize: (size: TextSize) => void;
  setHighContrast: (on: boolean) => void;
  setReduceMotion: (on: boolean) => void;
}

export const useAccessibilityStore = create<AccessibilityState>()(
  persist(
    (set) => ({
      textSize: "default",
      highContrast: false,
      reduceMotion: false,
      setTextSize: (textSize) => set({ textSize }),
      setHighContrast: (highContrast) => set({ highContrast }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
    }),
    {
      name: "proxyai.accessibility.v1",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

/** The multiplier every piece of text in the app is sized by. */
export function useTextScale(): number {
  return TEXT_SCALES[useAccessibilityStore((s) => s.textSize)];
}
