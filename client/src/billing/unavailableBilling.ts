import { BillingProvider } from "./types";

/**
 * No way to buy, for the builds Play does not distribute.
 *
 * Ferry sells the add-on through Play and nowhere else. A web checkout needs a
 * merchant of record willing to underwrite the category, and the two that were
 * approached both declined — so a browser, or an APK downloaded from anywhere
 * but Play, can use the free model and nothing more.
 *
 * This exists rather than a null provider so the rest of the app does not have
 * to ask where it is running. Buying reports why it cannot happen, restoring
 * finds nothing, and the paid models stay visibly locked.
 */
export const unavailableBilling: BillingProvider = {
  kind: "web",

  async init() {
    return null;
  },

  async buy() {
    return { receipt: null, error: "Ferry Pro is only available in the Google Play version." };
  },

  async restore() {
    return { receipt: null };
  },
};
