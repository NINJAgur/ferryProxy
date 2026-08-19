import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";

// Closes the popup/tab and hands the result back once Google redirects.
WebBrowser.maybeCompleteAuthSession();

export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "";

const DISCOVERY = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

export class SignInNotConfigured extends Error {
  constructor() {
    super(
      "Google sign-in isn't set up yet. Add EXPO_PUBLIC_GOOGLE_CLIENT_ID to client/.env " +
        "and GOOGLE_CLIENT_ID to server/.env."
    );
    this.name = "SignInNotConfigured";
  }
}

export function isSignInConfigured(): boolean {
  return GOOGLE_CLIENT_ID.length > 0;
}

/** The URI Google must be told to redirect back to; also what you paste into the
 *  OAuth client's "Authorized redirect URIs". Logged on failure so it can be copied. */
export function redirectUri(): string {
  return AuthSession.makeRedirectUri({ preferLocalhost: true });
}

/**
 * Signs in with Google and returns an ID token for the relay to verify.
 *
 * An implicit id_token flow is used rather than an authorization code: Ferry only
 * needs to prove who the user is, and a public mobile client cannot keep a client
 * secret anyway. Nothing about the model providers happens here — the relay holds
 * those accounts, so no provider credential ever reaches the device.
 */
export async function signInWithGoogle(): Promise<string> {
  if (!isSignInConfigured()) {
    throw new SignInNotConfigured();
  }

  const request = new AuthSession.AuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    redirectUri: redirectUri(),
    responseType: AuthSession.ResponseType.IdToken,
    scopes: ["openid", "profile", "email"],
    // Google requires a nonce for an id_token response; AuthRequest generates one.
    extraParams: { nonce: Math.random().toString(36).slice(2) },
  });

  const result = await request.promptAsync(DISCOVERY, {
    useProxy: false,
  } as AuthSession.AuthRequestPromptOptions);

  if (result.type === "dismiss" || result.type === "cancel") {
    throw new Error("Sign-in was cancelled.");
  }
  if (result.type !== "success") {
    const detail = "error" in result && result.error ? String(result.error) : result.type;
    throw new Error(
      `Google sign-in failed (${detail}). Check that ${redirectUri()} is listed as an ` +
        `authorized redirect URI on the OAuth client.`
    );
  }

  const idToken = result.params?.id_token;
  if (!idToken) {
    throw new Error("Google returned no id_token — the OAuth client may not allow this flow.");
  }
  return idToken;
}

/** Shown in setup so the exact value to authorise can be read off the screen. */
export function signInDiagnostics(): string {
  return `platform: ${Platform.OS} · redirect: ${isSignInConfigured() ? redirectUri() : "n/a"}`;
}
