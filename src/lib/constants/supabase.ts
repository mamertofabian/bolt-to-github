/**
 * Supabase Configuration Constants
 *
 * Centralized configuration for Supabase URL and keys used across the extension.
 * Update these values when changing Supabase projects or regenerating keys.
 */

export const SUPABASE_CONFIG = {
  URL: 'https://gapvjcqybzabnrjnxzhg.supabase.co',
  ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhcHZqY3F5YnphYm5yam54emhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc3MjMwMzQsImV4cCI6MjA2MzI5OTAzNH0.6bpYH1nccYIEKbQmctojedbrzMVBGcHhgjCyKXVUgzc',
} as const;

// Legacy exports for backward compatibility (if needed)
export const SUPABASE_URL = SUPABASE_CONFIG.URL;
export const SUPABASE_ANON_KEY = SUPABASE_CONFIG.ANON_KEY;
