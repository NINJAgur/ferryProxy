import { groupByProvider, groupUnlocked, providerStatus } from "../src/modelGroups";
import { ModelInfo } from "../src/transport/types";

function model(over: Partial<ModelInfo>): ModelInfo {
  return { id: "x", label: "X", provider: "gemini", tier: "paid", blurb: "",
    unlocked: true, reason: "subscribed", ...over };
}

describe("groupByProvider", () => {
  it("keeps a provider's variants together, in catalogue order", () => {
    const g = groupByProvider([
      model({ id: "flash", provider: "gemini", tier: "free" }),
      model({ id: "pro", provider: "gemini" }),
      model({ id: "haiku", provider: "anthropic" }),
    ]);
    expect(g.map((x) => x.provider)).toEqual(["gemini", "anthropic"]);
    expect(g[0].models.map((m) => m.id)).toEqual(["flash", "pro"]);
  });

  it("has nothing to group before the catalogue arrives", () => {
    expect(groupByProvider([])).toEqual([]);
  });
});

describe("providerStatus", () => {
  const status = (models: ModelInfo[]) => providerStatus({ provider: "gemini", models });

  it("says what is free when only some of it is", () => {
    // Gemini's shape: a free version plus paid ones. Calling the provider "free"
    // would promise the paid ones; calling it locked hides the one anyone can use.
    expect(status([
      model({ label: "Flash", tier: "free", reason: "free" }),
      model({ label: "Pro", unlocked: false, reason: "needs_subscription" }),
    ])).toBe("Flash free · more with Pro");
  });

  it("does not sell what the relay cannot serve", () => {
    expect(status([model({ unlocked: false, reason: "unavailable" })])).toBe("Temporarily unavailable");
  });
});

describe("groupUnlocked", () => {
  it("is true when any version can be used", () => {
    expect(groupUnlocked({ provider: "gemini",
      models: [model({ unlocked: false }), model({ unlocked: true })] })).toBe(true);
  });
});
