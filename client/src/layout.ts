import { useWindowDimensions } from "react-native";

/**
 * Ferry is laid out for a phone. In a browser window that layout does not scale
 * up — it either runs a line of text the whole width of a monitor, or sits in a
 * narrow strip with the screen empty around it.
 *
 * The fix is the one every reading app converges on: bars and dividers span the
 * whole window, while the content inside them stays in a column you can read
 * across without moving your head.
 */
export const WIDE_AT = 900;
export const COLUMN = 820;
/** Two columns side by side, with room to breathe between them. */
export const WIDE_COLUMN = 1180;

export function useWide(): boolean {
  return useWindowDimensions().width >= WIDE_AT;
}
