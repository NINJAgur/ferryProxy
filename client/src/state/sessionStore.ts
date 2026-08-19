import { create } from "zustand";

import { signInWithGoogle } from "../auth/google";
import { fetchSession, setSubscription } from "../transport/httpClient";
import { ModelInfo } from "../transport/types";

export type SessionPhase =
  | "signed_out"
  | "signing_in"
  /** Signed in; asking the relay which models this account may use. */
  | "loading_models"
  | "ready"
  | "failed";

interface SessionState {
  phase: SessionPhase;
  email: string | null;
  signedIn: boolean;
  subscribed: boolean;
  models: ModelInfo[];
  error: string | null;
  /** The Google ID token; sent to the relay, never stored anywhere else. */
  idToken: string | null;

  signIn: () => Promise<void>;
  loadAnonymous: () => Promise<void>;
  subscribe: () => Promise<void>;
  signOut: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  phase: "signed_out",
  email: null,
  signedIn: false,
  subscribed: false,
  models: [],
  error: null,
  idToken: null,

  signIn: async () => {
    set({ phase: "signing_in", error: null });
    try {
      const idToken = await signInWithGoogle();
      // Two visible phases on purpose: signing in is Google's business, working
      // out what the account may use is the relay's, and they fail differently.
      set({ phase: "loading_models", idToken });
      const session = await fetchSession(idToken);
      set({
        phase: "ready",
        email: session.email,
        signedIn: session.signedIn,
        subscribed: session.subscribed,
        models: session.models,
      });
    } catch (err) {
      set({ phase: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  },

  /** What an anonymous caller can use — asked for on launch, with no token. */
  loadAnonymous: async () => {
    set({ phase: "loading_models", error: null });
    try {
      const session = await fetchSession();
      set({
        phase: "ready",
        email: null,
        signedIn: session.signedIn,
        subscribed: session.subscribed,
        models: session.models,
      });
    } catch (err) {
      set({ phase: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  },

  subscribe: async () => {
    const token = get().idToken;
    if (!token) return;
    set({ phase: "loading_models", error: null });
    try {
      const session = await setSubscription(token, true);
      set({
        phase: "ready",
        email: session.email,
        signedIn: session.signedIn,
        subscribed: session.subscribed,
        models: session.models,
      });
    } catch (err) {
      set({ phase: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  },

  signOut: () =>
    set({
      phase: "signed_out",
      email: null,
      signedIn: false,
      subscribed: false,
      models: [],
      idToken: null,
      error: null,
    }),
}));

export function unlockedModels(models: ModelInfo[]): ModelInfo[] {
  return models.filter((m) => m.unlocked);
}

/**
 * Which model the chat should be on.
 *
 * Someone who paid should land on what they paid for, so a paid model wins over
 * the free one. An explicit choice is kept — unless it has since been locked
 * (subscription lapsed, or the relay lost the key), because leaving it selected
 * would mean every send is refused.
 */
export function pickDefaultModel(models: ModelInfo[], current?: string): string | undefined {
  const chosen =
    models.find((m) => m.unlocked && m.tier === "paid") ?? models.find((m) => m.unlocked);
  if (!chosen) return undefined;

  const currentModel = models.find((m) => m.id === current);
  return current && currentModel?.unlocked ? current : chosen.id;
}
