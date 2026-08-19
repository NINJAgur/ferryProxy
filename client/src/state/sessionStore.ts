import { create } from "zustand";

import { signInWithGoogle } from "../auth/google";
import { fetchSession, setSubscription } from "../transport/httpClient";
import { ModelAccess } from "../transport/types";

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
  subscribed: boolean;
  models: ModelAccess[];
  error: string | null;
  /** The Google ID token; sent to the relay, never stored anywhere else. */
  idToken: string | null;

  signIn: () => Promise<void>;
  subscribe: () => Promise<void>;
  signOut: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  phase: "signed_out",
  email: null,
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
        subscribed: session.subscribed,
        models: session.models,
      });
    } catch (err) {
      set({ phase: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  },

  signOut: () =>
    set({ phase: "signed_out", email: null, subscribed: false, models: [], idToken: null, error: null }),
}));

export function unlockedModels(models: ModelAccess[]): ModelAccess[] {
  return models.filter((m) => m.unlocked);
}
