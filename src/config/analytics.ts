// Analytics configuration
// This file handles environment variable access to avoid import.meta issues in tests

export function getAnalyticsApiSecret(): string {
  // @ts-expect-error - import.meta is not available in tests
  return import.meta.env.VITE_GA4_API_SECRET || '';
}
