jest.mock("../../src/auth/google");
jest.mock("../../src/transport/httpClient", () => {
  const actual = jest.requireActual("../../src/transport/httpClient");
  return { ...actual, fetchSession: jest.fn(), setSubscription: jest.fn() };
});

import { signInWithGoogle } from "../../src/auth/google";
import { fetchSession, setSubscription } from "../../src/transport/httpClient";
import { useSessionStore } from "../../src/state/sessionStore";
import { ModelAccess } from "../../src/transport/types";

const mockSignIn = signInWithGoogle as jest.MockedFunction<typeof signInWithGoogle>;
const mockFetchSession = fetchSession as jest.MockedFunction<typeof fetchSession>;
const mockSetSubscription = setSubscription as jest.MockedFunction<typeof setSubscription>;

const MODELS: ModelAccess[] = [
  { name: "gemini", label: "Gemini", unlocked: true, reason: "included", needsSubscription: false },
  {
    name: "anthropic",
    label: "Claude",
    unlocked: false,
    reason: "needs_subscription",
    needsSubscription: true,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  useSessionStore.setState({
    phase: "signed_out",
    email: null,
    subscribed: false,
    models: [],
    error: null,
    idToken: null,
  });
});

describe("sessionStore", () => {
  it("signs in and reports which models the account may use", async () => {
    mockSignIn.mockResolvedValue("id-token");
    mockFetchSession.mockResolvedValue({ email: "a@b.c", subscribed: false, models: MODELS });

    await useSessionStore.getState().signIn();

    const s = useSessionStore.getState();
    expect(s.phase).toBe("ready");
    expect(s.email).toBe("a@b.c");
    expect(s.models.find((m) => m.name === "gemini")?.unlocked).toBe(true);
    expect(s.models.find((m) => m.name === "anthropic")?.unlocked).toBe(false);
  });

  it("holds the id token for later requests but never a provider key", async () => {
    mockSignIn.mockResolvedValue("id-token");
    mockFetchSession.mockResolvedValue({ email: "a@b.c", subscribed: false, models: MODELS });

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
      subscribed: true,
      models: MODELS.map((m) => ({ ...m, unlocked: true, reason: "included" as const })),
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
