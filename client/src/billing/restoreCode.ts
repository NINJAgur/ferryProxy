import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * A restore code held on this device, if one has been entered.
 *
 * The web checkout records a purchase against an id this install generated, and
 * a reinstall generates a different one — so without something the buyer
 * carries, a purchase is stranded on the device that made it. A code entered
 * here takes the place of that id, and the relay resolves it back to the
 * original customer before asking the store anything.
 */
const STORAGE_KEY = "ferry-restore-code";
export const CODE_PREFIX = "code:";

let cached: string | null | undefined;

export async function storedCode(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    cached = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    cached = null;
  }
  return cached;
}

export async function rememberCode(code: string): Promise<void> {
  const tidy = code.trim().toUpperCase();
  cached = tidy;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, tidy);
  } catch {
    // Storage can fail. The code still works for this run, and the buyer has it
    // written down — that is the point of a code.
  }
}

export async function forgetCode(): Promise<void> {
  cached = null;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: the next launch simply reads it again.
  }
}
