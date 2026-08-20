/**
 * Which way a build sells the add-on. Kept free of imports so it can be reasoned
 * about — and tested — without dragging a native module in behind it.
 *
 * Play requires its own billing for anything it distributes, so a Play build must
 * say so explicitly. Everything else — a direct APK, Aptoide, a browser — uses the
 * web checkout, which that rule does not reach. Defaulting to the web checkout is
 * the safe direction: guessing "play" for a build Play never distributed would put
 * it in breach of terms it was never listed under, while guessing "web" merely
 * fails to sell anything until it is configured.
 */
export type BillingKind = "play" | "web";

export function chooseBilling(platformOS: string, configured: string | undefined): BillingKind {
  // A browser has no native billing module, so Play billing cannot work there
  // regardless of what the build was configured with.
  if (platformOS === "web") return "web";
  return configured === "play" ? "play" : "web";
}
