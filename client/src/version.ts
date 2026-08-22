import * as Application from "expo-application";
import Constants from "expo-constants";

/**
 * What this copy of Ferry is, for a tester to quote in a bug report.
 *
 * Read from the installed app rather than app.json: EAS assigns the build
 * number on its own server when it builds, so the value in the config is stale
 * the moment it is committed. The footer said "0.4" for nine builds.
 *
 * On web there is no installed app, so the version from the bundle is all there
 * is — and there is no build number, which is honest: the web app is whatever
 * was last deployed.
 */
export function versionLabel(): string {
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version;
  const build = Application.nativeBuildVersion;
  if (!version) return "Ferry";
  return build ? `Ferry ${version} (${build})` : `Ferry ${version}`;
}
