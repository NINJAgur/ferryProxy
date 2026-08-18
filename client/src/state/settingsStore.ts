import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface SettingsValues {
  answerShortFirst: boolean;
  sendWhenLineAppears: boolean;
  keepTryingQuietly: boolean;
  warnBeforeLongAnswers: boolean;
}

interface SettingsState extends SettingsValues {
  setSetting: (key: keyof SettingsValues, value: boolean) => void;
}

export const SHORT_ANSWER_MAX_TOKENS = 400;
export const LONG_ANSWER_WARNING_MS = 60000;

/** "Keep trying quietly": Ferry absorbs this many failures before it surfaces
 *  a retry to the user. Off, the first failure is shown immediately. */
export const QUIET_RETRIES_BEFORE_SURFACING = 2;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      answerShortFirst: true,
      sendWhenLineAppears: true,
      keepTryingQuietly: true,
      warnBeforeLongAnswers: false,
      setSetting: (key, value) => set({ [key]: value } as Partial<SettingsState>),
    }),
    {
      name: "proxyai.settings.v1",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
