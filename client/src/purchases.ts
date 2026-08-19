import { Platform } from "react-native";

import { BASE_URL } from "./transport/httpClient";

/**
 * Buying the add-on.
 *
 * Ferry is one free app with one non-consumable purchase, so there is no account
 * here and nothing to sign into: the store owns the record and RevenueCat gives
 * it a stable id. That id is what travels to the relay, which verifies it
 * server-side — the app never decides what it is entitled to.
 *
 * The native module does not exist on web or in Expo Go. There it falls back to
 * the relay's dev endpoint, which production refuses, so a real build is the only
 * way to actually unlock anything.
 */

const ENTITLEMENT_ID = "pro";
const DEV_RECEIPT = "dev:this-device";

const API_KEY =
  Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

export interface PurchaseResult {
  receipt: string | null;
  error?: string;
}

type PurchasesModule = typeof import("react-native-purchases").default;

let purchases: PurchasesModule | null = null;
let configured = false;

/** The SDK, or null where it cannot run (web, Expo Go, or no key configured). */
function load(): PurchasesModule | null {
  if (purchases) return purchases;
  if (Platform.OS === "web" || !API_KEY) return null;
  try {
    // Required lazily: importing it on web pulls in a native module that is not there.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    purchases = require("react-native-purchases").default as PurchasesModule;
    return purchases;
  } catch {
    return null;
  }
}

/**
 * Start the SDK and report the receipt this device already owns, if any.
 *
 * Returning null is the ordinary case, not a failure: it means nobody has bought
 * anything here, which is what a free install looks like.
 */
export async function initPurchases(): Promise<string | null> {
  const sdk = load();
  if (!sdk || !API_KEY) return null;
  try {
    if (!configured) {
      await sdk.configure({ apiKey: API_KEY });
      configured = true;
    }
    const info = await sdk.getCustomerInfo();
    return info.entitlements.active[ENTITLEMENT_ID] ? await sdk.getAppUserID() : null;
  } catch {
    return null;
  }
}

async function devFallback(unlocked: boolean): Promise<PurchaseResult> {
  try {
    const response = await fetch(`${BASE_URL}/v1/dev/entitlement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipt: DEV_RECEIPT, unlocked }),
    });
    if (!response.ok) return { receipt: null, error: "Purchases aren't available here." };
    return { receipt: unlocked ? DEV_RECEIPT : null };
  } catch {
    return { receipt: null, error: "Couldn't reach the store." };
  }
}

export async function buyAddOn(): Promise<PurchaseResult> {
  const sdk = load();
  if (!sdk) return devFallback(true);

  try {
    if (!configured && API_KEY) {
      await sdk.configure({ apiKey: API_KEY });
      configured = true;
    }
    const offerings = await sdk.getOfferings();
    const pack = offerings.current?.availablePackages[0];
    if (!pack) return { receipt: null, error: "Nothing is on sale right now." };

    const { customerInfo } = await sdk.purchasePackage(pack);
    if (!customerInfo.entitlements.active[ENTITLEMENT_ID]) {
      return { receipt: null, error: "The purchase didn't complete." };
    }
    return { receipt: await sdk.getAppUserID() };
  } catch (err) {
    // Backing out of the payment sheet is a decision, not a failure to report.
    if ((err as { userCancelled?: boolean }).userCancelled) return { receipt: null };
    return { receipt: null, error: message(err) };
  }
}

/**
 * Replay a purchase onto this device. Required by both stores, and the reason
 * Ferry needs no accounts: the store already knows what was bought.
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  const sdk = load();
  // The relay decides what the receipt is worth, so handing one back is not the
  // same as unlocking: a device cannot restore what it never bought.
  if (!sdk) return { receipt: DEV_RECEIPT };

  try {
    if (!configured && API_KEY) {
      await sdk.configure({ apiKey: API_KEY });
      configured = true;
    }
    const info = await sdk.restorePurchases();
    if (!info.entitlements.active[ENTITLEMENT_ID]) return { receipt: null };
    return { receipt: await sdk.getAppUserID() };
  } catch (err) {
    return { receipt: null, error: message(err) };
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong with the store.";
}
