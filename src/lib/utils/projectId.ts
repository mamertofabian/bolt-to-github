/**
 * Utility functions for extracting and working with project IDs from bolt.new URLs
 */

/**
 * Extract project ID from bolt.new URL
 * URL format: https://bolt.new/~/PROJECT_ID
 * @param url The URL to extract project ID from (defaults to current URL)
 * @returns The project ID or null if not found
 */
export function extractProjectIdFromUrl(url?: string): string | null {
  const targetUrl = url || window.location.href;
  const projectMatch = targetUrl.match(/bolt\.new\/~\/([^/?#]+)/);
  return projectMatch ? projectMatch[1] : null;
}

/**
 * Get the current project ID from the current page URL
 * @returns The project ID or null if not found
 */
export function getCurrentProjectId(): string | null {
  return extractProjectIdFromUrl();
}

/**
 * Check if the current URL is a bolt.new project page
 * @param url The URL to check (defaults to current URL)
 * @returns True if it's a project page
 */
export function isProjectPage(url?: string): boolean {
  return extractProjectIdFromUrl(url) !== null;
}
