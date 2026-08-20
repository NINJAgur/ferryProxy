import { ModelInfo, Provider } from "./transport/types";

export const PROVIDER_NAME: Record<Provider, string> = {
  gemini: "Gemini",
  anthropic: "Claude",
  openai: "GPT",
};

export interface ProviderGroup {
  provider: Provider;
  models: ModelInfo[];
}

/** Providers in catalogue order, each with its variants. */
export function groupByProvider(models: ModelInfo[]): ProviderGroup[] {
  const order: Provider[] = [];
  const byProvider = new Map<Provider, ModelInfo[]>();
  for (const model of models) {
    if (!byProvider.has(model.provider)) {
      byProvider.set(model.provider, []);
      order.push(model.provider);
    }
    byProvider.get(model.provider)!.push(model);
  }
  return order.map((provider) => ({ provider, models: byProvider.get(provider)! }));
}

/**
 * What to say about a provider in one line.
 *
 * Screen A and Settings answer "what can I reach", not "which version do I want"
 * — listing every variant there turns two short lists into a wall. Choosing a
 * version belongs in the chat, next to the conversation it affects.
 */
export function providerStatus(group: ProviderGroup): string {
  const unlocked = group.models.filter((m) => m.unlocked);
  if (unlocked.length === 0) {
    // Not an upsell when the relay simply has no key for it.
    return group.models.every((m) => m.reason === "unavailable")
      ? "Temporarily unavailable"
      : "Upgrade to Pro";
  }
  if (unlocked.length === group.models.length) {
    return group.models.every((m) => m.tier === "free") ? "Free" : "Included in Pro";
  }
  const free = unlocked.filter((m) => m.tier === "free").map((m) => m.label);
  return free.length ? `${free.join(", ")} free · more with Pro` : "Partly included";
}

/** Whether anything in this group can be used at all. */
export function groupUnlocked(group: ProviderGroup): boolean {
  return group.models.some((m) => m.unlocked);
}
