import { Platform } from "react-native";

import { chooseBilling } from "./choose";
import { playBilling } from "./playBilling";
import { BillingProvider } from "./types";
import { webBilling } from "./webBilling";

export { BillingProvider, PurchaseResult } from "./types";
export { chooseBilling } from "./choose";

/**
 * Which way this build sells the add-on, fixed when the build is made.
 *
 * `EXPO_PUBLIC_BILLING=play` for the Play build, because Play requires its own
 * billing. Anything else — a direct APK, Aptoide, the browser — uses the web
 * checkout, which Play's rule does not reach. A browser has no native billing
 * module at all, so it never gets the Play provider whatever is configured.
 */
export const billing: BillingProvider =
  chooseBilling(Platform.OS, process.env.EXPO_PUBLIC_BILLING) === "play" ? playBilling : webBilling;

export const initPurchases = () => billing.init();
export const buyAddOn = () => billing.buy();
export const restorePurchases = () => billing.restore();
