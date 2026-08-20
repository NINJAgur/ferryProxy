import { chooseBilling } from "../../src/billing/choose";

/**
 * Which billing provider a build gets is a policy question, not a preference:
 * Play requires its own billing for anything it distributes, so a Play build
 * routing purchases to a web checkout would breach the terms it is listed under.
 */
describe("chooseBilling", () => {
  it("uses Play billing for a Play build", () => {
    expect(chooseBilling("android", "play")).toBe("play");
  });

  it("uses the web checkout for a sideloaded build", () => {
    // Distributed outside Play, so Play's billing requirement does not reach it.
    expect(chooseBilling("android", "web")).toBe("web");
  });

  it("defaults to the web checkout when nothing is configured", () => {
    // Guessing "play" would put an unlisted build in breach; guessing "web" only
    // fails to sell anything until it is set up.
    expect(chooseBilling("android", undefined)).toBe("web");
  });

  it("never uses Play billing in a browser, whatever the build says", () => {
    // There is no native billing module on web; it would fail at runtime.
    expect(chooseBilling("web", "play")).toBe("web");
  });
});
