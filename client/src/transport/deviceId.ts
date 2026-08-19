import AsyncStorage from "@react-native-async-storage/async-storage";

import { generateId } from "./ids";

/**
 * A stable id for this install, so free answers can be metered per device.
 *
 * Not an identity and not a credential: it says nothing about who is holding the
 * phone, and a reinstall produces a new one. It exists so one device cannot spend
 * the free tier that everyone else shares — the relay falls back to metering by
 * address when it is missing, so omitting it buys nothing.
 */
const STORAGE_KEY = "ferry-device-id";

let cached: string | null = null;

export async function deviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
    const fresh = generateId();
    await AsyncStorage.setItem(STORAGE_KEY, fresh);
    cached = fresh;
    return fresh;
  } catch {
    // Storage can fail; a per-session id still meters this run, and the relay
    // falls back to the address if the header never arrives at all.
    cached = cached ?? generateId();
    return cached;
  }
}
