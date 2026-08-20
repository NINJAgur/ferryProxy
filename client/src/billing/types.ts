/**
 * How Ferry sells the add-on, independent of where the app came from.
 *
 * Two implementations, because the store an app is distributed through decides
 * how it may take money: Play requires Play Billing, while an APK downloaded from
 * anywhere else — or Ferry running in a browser — takes payment through a hosted
 * web checkout. Both end with a RevenueCat customer id, which is the only thing
 * the relay ever sees, so `receipts.py` does not know or care which was used.
 */
export interface PurchaseResult {
  /** The id the relay should verify, or null when nothing was bought. */
  receipt: string | null;
  error?: string;
  /**
   * The purchase left the app and has not come back yet — a web checkout opens a
   * browser, so there is no answer to wait for. The caller re-checks instead of
   * treating this as a failure.
   */
  pending?: boolean;
}

export interface BillingProvider {
  /** Name of the mechanism, for logs and for what the UI tells the user. */
  readonly kind: "play" | "web";
  /** Whatever this device already owns, or null. Never throws. */
  init(): Promise<string | null>;
  buy(): Promise<PurchaseResult>;
  restore(): Promise<PurchaseResult>;
}
