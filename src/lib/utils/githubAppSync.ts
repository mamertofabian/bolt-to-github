/**
 * GitHub App Sync Utilities
 * Helper functions to sync GitHub App installation from web app to extension
 */

import { SupabaseAuthService } from '../../content/services/SupabaseAuthService';
import { ChromeStorageService } from '../services/chromeStorage';

/**
 * Manually trigger GitHub App sync from web app
 */
export async function syncGitHubAppFromWebApp(): Promise<{
  success: boolean;
  hasGitHubApp: boolean;
  message: string;
}> {
  try {
    console.log('🔄 Starting manual GitHub App sync...');
    
    const authService = SupabaseAuthService.getInstance();
    
    // Check current authentication state
    const authState = authService.getAuthState();
    if (!authState.isAuthenticated) {
      return {
        success: false,
        hasGitHubApp: false,
        message: 'Please authenticate with bolt2github.com first',
      };
    }

    // Trigger the sync
    const syncResult = await authService.syncGitHubApp();
    
    if (!syncResult) {
      return {
        success: false,
        hasGitHubApp: false,
        message: 'Failed to sync GitHub App. Please check your authentication.',
      };
    }

    // Check if GitHub App is now configured
    const hasGitHubApp = await authService.hasGitHubApp();
    
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
        message: 'No GitHub App installation found. Please connect GitHub App on bolt2github.com first.',
      };
    }
  } catch (error) {
    console.error('Error syncing GitHub App:', error);
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
export async function checkGitHubAppStatus(): Promise<{
  isConfigured: boolean;
  username?: string;
  avatarUrl?: string;
  installationId?: number;
}> {
  try {
    const storage = await ChromeStorageService.getGitHubAppConfig();
    const authMethod = await ChromeStorageService.getAuthenticationMethod();
    
    const isConfigured = authMethod === 'github_app' && !!storage.installationId;
    
    return {
      isConfigured,
      username: storage.username,
      avatarUrl: storage.avatarUrl,
      installationId: storage.installationId,
    };
  } catch (error) {
    console.error('Error checking GitHub App status:', error);
    return { isConfigured: false };
  }
}

/**
 * Switch authentication method to GitHub App (if available)
 */
export async function switchToGitHubApp(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const status = await checkGitHubAppStatus();
    
    if (!status.isConfigured) {
      // Try to sync first
      const syncResult = await syncGitHubAppFromWebApp();
      
      if (!syncResult.hasGitHubApp) {
        return {
          success: false,
          message: 'GitHub App not found. Please connect GitHub App on bolt2github.com first.',
        };
      }
    }

    // Set authentication method to GitHub App
    await ChromeStorageService.setAuthenticationMethod('github_app');
    
    return {
      success: true,
      message: 'Switched to GitHub App authentication successfully!',
    };
  } catch (error) {
    console.error('Error switching to GitHub App:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to switch authentication method',
    };
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
    const authService = SupabaseAuthService.getInstance();
    
    // Clear current token to force refresh
    await ChromeStorageService.saveGitHubAppConfig({
      accessToken: undefined,
    });

    // Trigger sync to get fresh token
    const syncResult = await authService.syncGitHubApp();
    
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
    console.error('Error refreshing GitHub App token:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to refresh token',
    };
  }
}

/**
 * Get detailed GitHub App information for UI display
 */
export async function getGitHubAppInfo(): Promise<{
  isConfigured: boolean;
  authMethod: 'pat' | 'github_app';
  username?: string;
  avatarUrl?: string;
  expiresAt?: string;
  scopes?: string[];
  needsRefresh?: boolean;
}> {
  try {
    const authMethod = await ChromeStorageService.getAuthenticationMethod();
    const storage = await ChromeStorageService.getGitHubAppConfig();
    
    const isConfigured = authMethod === 'github_app' && !!storage.installationId;
    
    let needsRefresh = false;
    if (storage.expiresAt) {
      const expirationTime = new Date(storage.expiresAt).getTime();
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      needsRefresh = (expirationTime - now) < fiveMinutes;
    }

    return {
      isConfigured,
      authMethod,
      username: storage.username,
      avatarUrl: storage.avatarUrl,
      expiresAt: storage.expiresAt,
      scopes: storage.scopes,
      needsRefresh,
    };
  } catch (error) {
    console.error('Error getting GitHub App info:', error);
    return {
      isConfigured: false,
      authMethod: 'pat',
    };
  }
}