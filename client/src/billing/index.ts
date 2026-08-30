import { Platform } from "react-native";

import { chooseBilling } from "./choose";
import { playBilling } from "./playBilling";
import { BillingProvider } from "./types";
import { unavailableBilling } from "./unavailableBilling";

export { BillingProvider, PurchaseResult } from "./types";
export { chooseBilling } from "./choose";

/**
 * Which way this build sells the add-on, fixed when the build is made.
 *
 * `EXPO_PUBLIC_BILLING=play` for the Play build, because Play requires its own
 * billing for anything it distributes. Everything else can only look: a browser
 * has no native billing module, and Ferry has no web checkout to fall back on.
 */
export const billing: BillingProvider =
  chooseBilling(Platform.OS, process.env.EXPO_PUBLIC_BILLING) === "play" ? playBilling : unavailableBilling;

export const initPurchases = () => billing.init();
export const buyAddOn = () => billing.buy();
export const restorePurchases = () => billing.restore();
