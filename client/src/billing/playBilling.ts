import { Platform } from "react-native";

import { BillingProvider, PurchaseResult } from "./types";

/**
 * Google Play Billing, through RevenueCat.
 *
 * Play requires its own billing for digital goods in apps it distributes, so this
 * is the only provider a Play build may use. The native module does not exist on
 * web or in Expo Go, where every call reports "not available" rather than crashing.
 */
const ENTITLEMENT_ID = "pro";

const API_KEY =
  Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

type PurchasesModule = typeof import("react-native-purchases").default;

let purchases: PurchasesModule | null = null;
let configured = false;

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

async function ready(): Promise<PurchasesModule | null> {
  const sdk = load();
  if (!sdk || !API_KEY) return null;
  if (!configured) {
    await sdk.configure({ apiKey: API_KEY });
    configured = true;
  }
  return sdk;
}

const unavailable: PurchaseResult = {
  receipt: null,
  error: "Purchases aren't available in this build.",
};

export const playBilling: BillingProvider = {
  kind: "play",

  async init() {
    try {
      const sdk = await ready();
      if (!sdk) return null;
      const info = await sdk.getCustomerInfo();
      return info.entitlements.active[ENTITLEMENT_ID] ? await sdk.getAppUserID() : null;
    } catch {
      // Nothing owned is the ordinary case, and a store that cannot be reached
      // must not stop a free install from working.
      return null;
    }
  },

  async buy() {
    try {
      const sdk = await ready();
      if (!sdk) return unavailable;

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
  },

  async restore() {
    try {
      const sdk = await ready();
      if (!sdk) return unavailable;
      const info = await sdk.restorePurchases();
      if (!info.entitlements.active[ENTITLEMENT_ID]) return { receipt: null };
      return { receipt: await sdk.getAppUserID() };
    } catch (err) {
      return { receipt: null, error: message(err) };
    }
  },
};

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong with the store.";
}
