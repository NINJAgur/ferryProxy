import { create } from "zustand";

import { fetchEntitlement } from "../transport/httpClient";
import { ModelInfo } from "../transport/types";

export type EntitlementPhase = "idle" | "loading" | "ready" | "failed";

interface EntitlementState {
  phase: EntitlementPhase;
  /** True once the store confirms the add-on was bought. */
  unlocked: boolean;
  /** Owns the add-on but has spent this month's answers. */
  capped: boolean;
  answersUsed: number;
  answersAllowed: number;
  models: ModelInfo[];
  error: string | null;
  /** The store receipt. Not an identity — it only says a purchase exists. */
  receipt: string | null;

  /** Ask the relay what this device may use. Works with or without a receipt. */
  load: (receipt?: string) => Promise<void>;
}

export const useEntitlementStore = create<EntitlementState>((set, get) => ({
  phase: "idle",
  unlocked: false,
  capped: false,
  answersUsed: 0,
  answersAllowed: 0,
  models: [],
  error: null,
  receipt: null,

  load: async (receipt) => {
    const token = receipt ?? get().receipt ?? undefined;
    set({ phase: "loading", error: null });
    try {
      const entitlement = await fetchEntitlement(token);
      set({
        phase: "ready",
        receipt: token ?? null,
        unlocked: entitlement.unlocked,
        capped: entitlement.capped,
        answersUsed: entitlement.answersUsed,
        answersAllowed: entitlement.answersAllowed,
        models: entitlement.models,
      });
    } catch (err) {
      set({ phase: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  },
}));

export function unlockedModels(models: ModelInfo[]): ModelInfo[] {
  return models.filter((m) => m.unlocked);
}

/**
 * Which model the chat should be on.
 *
 * Someone who paid should land on what they paid for, so a paid model wins over
 * the free one. An explicit choice is kept — unless it has since been locked
 * (allowance spent, or the relay lost the key), because leaving it selected
 * would mean every send is refused.
 */
export function pickDefaultModel(models: ModelInfo[], current?: string): string | undefined {
  const chosen =
    models.find((m) => m.unlocked && m.tier === "paid") ?? models.find((m) => m.unlocked);
  if (!chosen) return undefined;

  const currentModel = models.find((m) => m.id === current);
  return current && currentModel?.unlocked ? current : chosen.id;
}
