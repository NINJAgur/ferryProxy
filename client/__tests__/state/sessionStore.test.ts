jest.mock("../../src/auth/google");
jest.mock("../../src/transport/httpClient", () => {
  const actual = jest.requireActual("../../src/transport/httpClient");
  return { ...actual, fetchSession: jest.fn(), setSubscription: jest.fn() };
});

import { signInWithGoogle } from "../../src/auth/google";
import { fetchSession, setSubscription } from "../../src/transport/httpClient";
import { pickDefaultModel, useSessionStore } from "../../src/state/sessionStore";
import { ModelInfo } from "../../src/transport/types";

const mockSignIn = signInWithGoogle as jest.MockedFunction<typeof signInWithGoogle>;
const mockFetchSession = fetchSession as jest.MockedFunction<typeof fetchSession>;
const mockSetSubscription = setSubscription as jest.MockedFunction<typeof setSubscription>;

const MODELS: ModelInfo[] = [
  {
    id: "gemini-3.6-flash",
    label: "Gemini Flash",
    provider: "gemini",
    tier: "free",
    blurb: "Fast and free",
    unlocked: true,
    reason: "free",
  },
  {
    id: "claude-opus-5",
    label: "Claude",
    provider: "anthropic",
    tier: "paid",
    blurb: "Anthropic's flagship",
    unlocked: false,
    reason: "needs_subscription",
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({
    phase: "signed_out",
    email: null,
    signedIn: false,
    subscribed: false,
    models: [],
    error: null,
    idToken: null,
  });
});

describe("sessionStore", () => {
  it("signs in and reports which models the account may use", async () => {
    mockSignIn.mockResolvedValue("id-token");
    mockFetchSession.mockResolvedValue({ email: "a@b.c", signedIn: true, subscribed: false, models: MODELS });

    await useSessionStore.getState().signIn();

    const s = useSessionStore.getState();
    expect(s.phase).toBe("ready");
    expect(s.email).toBe("a@b.c");
    expect(s.models.find((m) => m.provider === "gemini")?.unlocked).toBe(true);
    expect(s.models.find((m) => m.provider === "anthropic")?.unlocked).toBe(false);
  });

  it("holds the id token for later requests but never a provider key", async () => {
    mockSignIn.mockResolvedValue("id-token");
    mockFetchSession.mockResolvedValue({ email: "a@b.c", signedIn: true, subscribed: false, models: MODELS });

    await useSessionStore.getState().signIn();

    expect(useSessionStore.getState().idToken).toBe("id-token");
    expect(JSON.stringify(useSessionStore.getState())).not.toMatch(/sk-|AIza|apiKey/);
  });

  it("surfaces a sign-in failure instead of pretending to be signed in", async () => {
    mockSignIn.mockRejectedValue(new Error("Google sign-in isn't set up yet"));

    await useSessionStore.getState().signIn();

    const s = useSessionStore.getState();
    expect(s.phase).toBe("failed");
    expect(s.error).toMatch(/isn't set up/);
    expect(s.email).toBeNull();
  });

  it("separates a relay failure from a Google failure", async () => {
    mockSignIn.mockResolvedValue("id-token");
    mockFetchSession.mockRejectedValue(new Error("relay unreachable"));

    await useSessionStore.getState().signIn();

    expect(useSessionStore.getState().phase).toBe("failed");
    expect(useSessionStore.getState().error).toMatch(/relay unreachable/);
  });

  it("subscribing unlocks the paid models", async () => {
    useSessionStore.setState({ phase: "ready", idToken: "id-token", models: MODELS });
    mockSetSubscription.mockResolvedValue({
      email: "a@b.c",
      signedIn: true,
      subscribed: true,
      models: MODELS.map((m) => ({ ...m, unlocked: true, reason: "subscribed" as const })),
    });

    await useSessionStore.getState().subscribe();

    const s = useSessionStore.getState();
    expect(s.subscribed).toBe(true);
    expect(s.models.every((m) => m.unlocked)).toBe(true);
  });

  it("signing out clears the account and the token", async () => {
    useSessionStore.setState({ phase: "ready", email: "a@b.c", idToken: "t", models: MODELS });

    useSessionStore.getState().signOut();

    const s = useSessionStore.getState();
    expect(s.phase).toBe("signed_out");
    expect(s.idToken).toBeNull();
    expect(s.models).toEqual([]);
  });
});

describe("anonymous access", () => {
  it("loads the catalogue with no token and no sign-in", async () => {
    mockFetchSession.mockResolvedValue({
      email: "",
      signedIn: false,
      subscribed: false,
      models: MODELS,
    });

    await useSessionStore.getState().loadAnonymous();

    const s = useSessionStore.getState();
    expect(mockFetchSession).toHaveBeenCalledWith();
    expect(s.phase).toBe("ready");
    expect(s.signedIn).toBe(false);
    expect(s.idToken).toBeNull();
    // The whole point: something is usable without an account.
    expect(s.models.some((m) => m.unlocked)).toBe(true);
  });

  it("never asks Google for anything on the anonymous path", async () => {
    mockFetchSession.mockResolvedValue({
      email: "",
      signedIn: false,
      subscribed: false,
      models: MODELS,
    });

    await useSessionStore.getState().loadAnonymous();

    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("reports a relay failure rather than silently showing no models", async () => {
    mockFetchSession.mockRejectedValue(new Error("relay unreachable"));

    await useSessionStore.getState().loadAnonymous();

    expect(useSessionStore.getState().phase).toBe("failed");
    expect(useSessionStore.getState().error).toMatch(/relay unreachable/);
  });
});

describe("pickDefaultModel", () => {
  const free = MODELS[0];
  const paidLocked = MODELS[1];
  const paidUnlocked = { ...MODELS[1], unlocked: true, reason: "subscribed" as const };

  it("uses the free model when nothing paid is unlocked", () => {
    expect(pickDefaultModel([free, paidLocked])).toBe(free.id);
  });

  it("prefers a paid model once it is unlocked", () => {
    // Someone who paid should land on what they paid for, not the free one.
    expect(pickDefaultModel([free, paidUnlocked])).toBe(paidUnlocked.id);
  });

  it("keeps a deliberate choice of the free model", () => {
    expect(pickDefaultModel([free, paidUnlocked], free.id)).toBe(free.id);
  });

  it("moves off a model that has since been locked", () => {
    // Subscription lapsed or the relay lost the key: leaving it selected would
    // mean every send is refused.
    expect(pickDefaultModel([free, paidLocked], paidLocked.id)).toBe(free.id);
  });

  it("returns nothing when no model is usable", () => {
    expect(pickDefaultModel([{ ...free, unlocked: false }, paidLocked])).toBeUndefined();
  });

  it("returns nothing for an empty catalogue", () => {
    expect(pickDefaultModel([])).toBeUndefined();
  });
});
