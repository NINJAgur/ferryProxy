import { Linking } from "react-native";

import { deviceId } from "../transport/deviceId";
import { BASE_URL, fetchCustomerId, fetchEntitlement } from "../transport/httpClient";
import { CODE_PREFIX, storedCode } from "./restoreCode";
import { BillingProvider, PurchaseResult } from "./types";

/**
 * A hosted web checkout, for builds Play does not distribute.
 *
 * An APK downloaded from Aptoide or GitHub, and Ferry running in a browser, are
 * both free to take payment on the web — Play's billing requirement applies only
 * to apps Play distributes. The checkout runs in a browser, carrying this
 * install's device id as custom data, and the provider hands that id back to the
 * relay over a signed webhook. The relay records the purchase itself — no store
 * holds it, and there is nothing to ask again later.
 *
 * The weakness is restores. A store can be asked "what did this person buy?"; a
 * web checkout cannot, so a reinstall generates a new id and loses the purchase.
 * Restore therefore re-asks the relay about the id this device has, which recovers
 * a purchase on the same install but not on a new phone. Making that work needs an
 * identifier a person carries — the checkout email, or a redemption code.
 */
const PURCHASE_URL = process.env.EXPO_PUBLIC_WEB_PURCHASE_URL;

export const webBilling: BillingProvider = {
  kind: "web",

  async init() {
    // Nothing is bought in-process, so ask the relay what this id is worth. It is
    // the authority in every case, and it already knows about web purchases.
    return owned();
  },

  async buy() {
    // With no checkout configured, ask the relay to grant it. Production refuses
    // this outright, so it unlocks nothing that is not already a development
    // relay — and it is the only way to exercise the flow before a store exists.
    if (!PURCHASE_URL) return devGrant();

    // The checkout carries the customer id as custom data and hands it back on
    // the webhook, which is the only thing tying a payment to an install. A
    // trailing path segment — which is what RevenueCat's links wanted — 404s
    // here, and a 404 looks exactly like a broken purchase link.
    const id = await purchaseCustomerId();
    const separator = PURCHASE_URL.includes("?") ? "&" : "?";
    const url = `${PURCHASE_URL}${separator}checkout[custom][customer_id]=${encodeURIComponent(id)}`;

    try {
      await Linking.openURL(url);
    } catch {
      return { receipt: null, error: "Couldn't open the checkout." };
    }
    // The browser has the purchase now. There is no result to await, so the app
    // says so rather than reporting a failure that has not happened.
    return { receipt: null, pending: true };
  },

  async restore() {
    const id = await owned();
    return id ? { receipt: id } : { receipt: null };
  },
};

/**
 * Development only. `ALLOW_DEV_SUBSCRIPTION` is false by default and false on the
 * deployed relay, which answers 403 — so this can only ever unlock against a relay
 * someone is running themselves.
 */
async function devGrant(): Promise<PurchaseResult> {
  const id = await receiptId();
  try {
    const response = await fetch(`${BASE_URL}/v1/dev/entitlement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipt: id, unlocked: true }),
    });
    if (!response.ok) {
      return { receipt: null, error: "Purchases aren't set up yet." };
    }
    return { receipt: id };
  } catch {
    return { receipt: null, error: "Couldn't reach the relay." };
  }
}

/**
 * Who a purchase from this install belongs to.
 *
 * Usually this device. But a device that restored with a code is not the one
 * that bought, and buying as itself would open a second customer with its own
 * pool — answers paid for that the relay never adds to the first.
 */
async function purchaseCustomerId(): Promise<string> {
  const code = await storedCode();
  if (!code) return deviceId();
  try {
    return await fetchCustomerId(`${CODE_PREFIX}${code}`);
  } catch {
    // Better to buy as this device than not at all; it leaves a pool to
    // reconcile by hand rather than a checkout that will not open.
    return deviceId();
  }
}

/**
 * What this install calls itself to the relay.
 *
 * A restore code wins when there is one: it is the whole reason a purchase can
 * move to another device, and the id this install generated has never been seen
 * by the store. Otherwise a real web purchase is recorded by the relay against
 * the bare device id, and a development grant has to carry the `dev:` prefix, or
 * verification falls through to the store and is refused — which looked exactly
 * like a purchase failing.
 */
async function receiptId(): Promise<string> {
  const code = await storedCode();
  if (code) return `${CODE_PREFIX}${code}`;
  const id = await deviceId();
  return PURCHASE_URL ? id : `dev:${id}`;
}

/** The receipt, if the relay says a purchase is attached to it. */
async function owned(): Promise<string | null> {
  try {
    const id = await receiptId();
    const entitlement = await fetchEntitlement(id);
    return entitlement.unlocked ? id : null;
  } catch {
    return null;
  }
}
