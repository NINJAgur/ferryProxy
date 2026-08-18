import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { create } from "zustand";

import { Provider } from "../transport/types";

/** Providers a user can supply their own key for. `demo` needs none. */
export const KEYED_PROVIDERS: Provider[] = ["anthropic", "openai", "gemini"];

const keyName = (p: Provider) => `ferry.key.${p}`;

/** Credentials go to the OS keystore (Keychain / Android Keystore), not to the
 *  same plain storage as chat history. SecureStore has no web implementation,
 *  so the browser preview falls back to localStorage — fine for a dev preview,
 *  and flagged as such in the UI. */
async function setSecret(provider: Provider, value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (value) localStorage.setItem(keyName(provider), value);
    else localStorage.removeItem(keyName(provider));
    return;
  }
  if (value) await SecureStore.setItemAsync(keyName(provider), value);
  else await SecureStore.deleteItemAsync(keyName(provider));
}

async function getSecret(provider: Provider): Promise<string | null> {
  if (Platform.OS === "web") return localStorage.getItem(keyName(provider));
  return SecureStore.getItemAsync(keyName(provider));
}

interface KeyState {
  keys: Partial<Record<Provider, string>>;
  loaded: boolean;
  load: () => Promise<void>;
  setKey: (provider: Provider, value: string) => Promise<void>;
}

export const useKeyStore = create<KeyState>((set, get) => ({
  keys: {},
  loaded: false,
  load: async () => {
    const entries = await Promise.all(
      KEYED_PROVIDERS.map(async (p) => [p, await getSecret(p)] as const)
    );
    const keys: Partial<Record<Provider, string>> = {};
    for (const [p, v] of entries) if (v) keys[p] = v;
    set({ keys, loaded: true });
  },
  setKey: async (provider, value) => {
    const trimmed = value.trim();
    await setSecret(provider, trimmed);
    const keys = { ...get().keys };
    if (trimmed) keys[provider] = trimmed;
    else delete keys[provider];
    set({ keys });
  },
}));

/** The key for a provider, if the user has supplied one. */
export function userKeyFor(provider: Provider): string | undefined {
  return useKeyStore.getState().keys[provider];
}
