/** Prevent a GA4 Measurement Protocol secret from entering a client-side build. */
export function assertAnalyticsSecretNotBundled(secret: string | undefined): void {
  if (secret?.trim()) {
    throw new Error('GA4 API secret must not be bundled into the Chrome extension');
  }
}
