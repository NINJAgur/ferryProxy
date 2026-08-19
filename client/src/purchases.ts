import { BASE_URL } from "./transport/httpClient";

/**
 * Buying the add-on.
 *
 * Ferry is one free app with one non-consumable purchase; the store owns the
 * record, so there is no account here and nothing to sign into. Until the store
 * products exist this goes through the relay's dev endpoint, which is refused in
 * production — so a device can exercise the locked and unlocked states without
 * the app ever being able to unlock itself.
 */

const DEV_RECEIPT = "dev:this-device";

export interface PurchaseResult {
  receipt: string | null;
  error?: string;
}

async function setDevEntitlement(unlocked: boolean): Promise<PurchaseResult> {
  try {
    const response = await fetch(`${BASE_URL}/v1/dev/entitlement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receipt: DEV_RECEIPT, unlocked }),
    });
    if (!response.ok) {
      return { receipt: null, error: "Purchases aren't available yet." };
    }
    return { receipt: unlocked ? DEV_RECEIPT : null };
  } catch {
    return { receipt: null, error: "Couldn't reach the store." };
  }
}

export function buyAddOn(): Promise<PurchaseResult> {
  return setDevEntitlement(true);
}

/**
 * Replay a purchase onto this device. Required by both stores, and the reason
 * Ferry needs no accounts: the receipt is what a new device asks the store for.
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  // The relay decides whether this receipt still owns anything; handing it back
  // is not the same as unlocking, so a device cannot restore what it never bought.
  return { receipt: DEV_RECEIPT };
}
