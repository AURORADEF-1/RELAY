/**
 * Local UI preview only. The production guard makes the bypass inert even if
 * the public environment variable is accidentally carried into a deployment.
 */
export const isLocalDemoMode =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_RELAY_DEMO_MODE === "true";

/** Allows local layout previews without changing the authenticated database role. */
export const isLocalRolePreviewEnabled = process.env.NODE_ENV === "development";
