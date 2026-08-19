jest.mock("../../src/transport/httpClient", () => {
  const actual = jest.requireActual("../../src/transport/httpClient");
  return { ...actual, fetchEntitlement: jest.fn() };
});

import { fetchEntitlement } from "../../src/transport/httpClient";
import { pickDefaultModel, useEntitlementStore } from "../../src/state/entitlementStore";
import { EntitlementInfo, ModelInfo } from "../../src/transport/types";

const mockFetch = fetchEntitlement as jest.MockedFunction<typeof fetchEntitlement>;

const FREE: ModelInfo = {
  id: "gemini-3.6-flash",
  label: "Gemini Flash",
  provider: "gemini",
  tier: "free",
  blurb: "Fast and free",
  unlocked: true,
  reason: "free",
};

const PAID: ModelInfo = {
  id: "claude-opus-5",
  label: "Claude",
  provider: "anthropic",
  tier: "paid",
  blurb: "Anthropic's flagship",
  unlocked: false,
  reason: "needs_subscription",
};

function info(over: Partial<EntitlementInfo> = {}): EntitlementInfo {
  return {
    unlocked: false,
    answersUsed: 0,
    answersAllowed: 300,
    capped: false,
    models: [FREE, PAID],
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  useEntitlementStore.setState({
    phase: "idle",
    unlocked: false,
    capped: false,
    answersUsed: 0,
    answersAllowed: 0,
    models: [],
    error: null,
    receipt: null,
  });
});

describe("entitlementStore", () => {
  it("asks with no receipt on a fresh install and still gets the free model", async () => {
    mockFetch.mockResolvedValue(info());

    await useEntitlementStore.getState().load();

    expect(mockFetch).toHaveBeenCalledWith(undefined);
    const state = useEntitlementStore.getState();
    expect(state.phase).toBe("ready");
    expect(state.unlocked).toBe(false);
    expect(state.models.find((m) => m.id === FREE.id)?.unlocked).toBe(true);
  });

  it("keeps the receipt so later sends carry it", async () => {
    mockFetch.mockResolvedValue(info({ unlocked: true, models: [FREE, { ...PAID, unlocked: true }] }));

    await useEntitlementStore.getState().load("dev:this-device");

    expect(useEntitlementStore.getState().receipt).toBe("dev:this-device");
    expect(useEntitlementStore.getState().unlocked).toBe(true);
  });

  it("reuses the stored receipt when reloading after a refused send", async () => {
    mockFetch.mockResolvedValue(info({ unlocked: true }));
    await useEntitlementStore.getState().load("dev:this-device");

    await useEntitlementStore.getState().load();

    expect(mockFetch).toHaveBeenLastCalledWith("dev:this-device");
  });

  it("reports a failure instead of silently showing no models", async () => {
    mockFetch.mockRejectedValue(new Error("relay unreachable"));

    await useEntitlementStore.getState().load();

    expect(useEntitlementStore.getState().phase).toBe("failed");
    expect(useEntitlementStore.getState().error).toBe("relay unreachable");
  });

  it("stays unlocked when the month's allowance is spent", async () => {
    // Owning the add-on and having answers left are different things: someone
    // over the cap must not be told to buy what they already bought.
    mockFetch.mockResolvedValue(info({ unlocked: true, capped: true, answersUsed: 300 }));

    await useEntitlementStore.getState().load("dev:this-device");

    const state = useEntitlementStore.getState();
    expect(state.unlocked).toBe(true);
    expect(state.capped).toBe(true);
  });
});

describe("pickDefaultModel", () => {
  it("puts a buyer on what they paid for, not the free model", () => {
    expect(pickDefaultModel([FREE, { ...PAID, unlocked: true }])).toBe(PAID.id);
  });

  it("falls back to the free model when nothing is bought", () => {
    expect(pickDefaultModel([FREE, PAID])).toBe(FREE.id);
  });

  it("keeps an explicit choice", () => {
    expect(pickDefaultModel([FREE, { ...PAID, unlocked: true }], FREE.id)).toBe(FREE.id);
  });

  it("moves off a choice that has since been locked", () => {
    // Leaving it selected would mean every send is refused.
    expect(pickDefaultModel([FREE, PAID], PAID.id)).toBe(FREE.id);
  });

  it("returns nothing when the relay offers nothing", () => {
    expect(pickDefaultModel([])).toBeUndefined();
  });
});
