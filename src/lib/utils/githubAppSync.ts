/**
 * GitHub App Sync Utilities
 * Helper functions to sync GitHub App installation from web app to extension
 */

import { BackgroundAuthClient } from '../services/BackgroundAuthClient';
import { ChromeStorageService } from '../services/chromeStorage';
import { createLogger } from './logger';

const logger = createLogger('GitHubAppSync');

type GitHubAppStatus = {
  isConfigured: boolean;
  username?: string;
  avatarUrl?: string;
  installationId?: number;
};

type GitHubAppInfo = {
  isConfigured: boolean;
  username?: string;
  avatarUrl?: string;
  expiresAt?: string;
  scopes?: string[];
  needsRefresh?: boolean;
};

/**
 * Manually trigger GitHub App sync from web app
 */
export async function syncGitHubAppFromWebApp(): Promise<{
  success: boolean;
  hasGitHubApp: boolean;
  message: string;
}> {
  try {
    logger.info('🔄 Starting manual GitHub App sync...');

    const authClient = new BackgroundAuthClient();

    // Check current authentication state
    const authState = await authClient.getAuthState();
    if (!authState.isAuthenticated) {
      return {
        success: false,
        hasGitHubApp: false,
        message: 'Please authenticate with bolt2github.com first',
      };
    }

    // Trigger the sync
    const syncResult = await authClient.syncGitHubApp();

    if (!syncResult) {
      return {
        success: false,
        hasGitHubApp: false,
        message: 'Failed to sync GitHub App. Please check your authentication.',
      };
    }

    // Check if GitHub App is now configured
    const hasGitHubApp = (await checkGitHubAppStatus()).isConfigured;

    if (hasGitHubApp) {
      return {
        success: true,
        hasGitHubApp: true,
        message: 'GitHub App synced successfully!',
      };
    } else {
      return {
        success: true,
        hasGitHubApp: false,
        message:
          'No GitHub App installation found. Please connect GitHub App on bolt2github.com first.',
      };
    }
  } catch (error) {
    logger.error('Error syncing GitHub App:', error);
    return {
      success: false,
      hasGitHubApp: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Check if GitHub App is already configured in the extension
 */
export async function checkGitHubAppStatus(): Promise<GitHubAppStatus> {
  try {
    const storage = await ChromeStorageService.getGitHubAppConfig();
    const isConfigured = !!storage.installationId;

    return {
      isConfigured,
      username: storage.username,
      avatarUrl: storage.avatarUrl,
      installationId: storage.installationId,
    };
  } catch (error) {
    logger.error('Error checking GitHub App status:', error);
    return { isConfigured: false };
  }
}

/**
 * Force refresh GitHub App token
 */
export async function refreshGitHubAppToken(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const authClient = new BackgroundAuthClient();

    // Clear current token to force refresh
    await ChromeStorageService.saveGitHubAppConfig({
      accessToken: undefined,
    });

    // Trigger sync to get fresh token
    const syncResult = await authClient.syncGitHubApp();

    if (syncResult) {
      return {
        success: true,
        message: 'GitHub App token refreshed successfully!',
      };
    } else {
      return {
        success: false,
        message: 'Failed to refresh GitHub App token. Please re-authenticate.',
      };
    }
  } catch (error) {
    logger.error('Error refreshing GitHub App token:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to refresh token',
    };
  }
}

/**
 * Get detailed GitHub App information for UI display
 */
export async function getGitHubAppInfo(): Promise<GitHubAppInfo> {
  try {
    const storage = await ChromeStorageService.getGitHubAppConfig();
    const isConfigured = !!storage.installationId;

    let needsRefresh = false;
    if (storage.expiresAt) {
      const expirationTime = new Date(storage.expiresAt).getTime();
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      needsRefresh = expirationTime - now < fiveMinutes;
    }

    return {
      isConfigured,
      username: storage.username,
      avatarUrl: storage.avatarUrl,
      expiresAt: storage.expiresAt,
      scopes: storage.scopes,
      needsRefresh,
    };
  } catch (error) {
    logger.error('Error getting GitHub App info:', error);
    return {
      isConfigured: false,
    };
  }
}
