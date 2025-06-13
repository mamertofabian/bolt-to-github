/**
 * UsageTracker - Tracks extension usage statistics and manages uninstall feedback URL
 *
 * This module is responsible for:
 * - Tracking usage statistics (installs, pushes, errors)
 * - Managing error logging
 * - Setting up uninstall feedback URL with anonymous usage data
 * - Respecting user privacy and telemetry preferences
 */

import type { UsageData, ErrorLogEntry } from '../lib/types';

export class UsageTracker {
  private readonly UNINSTALL_FEEDBACK_BASE_URL = 'https://bolt2github.com/uninstall-feedback';

  /**
   * Initialize usage data on extension install or update
   */
  async initializeUsageData(): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['usageData'], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Failed to get usage data: ${chrome.runtime.lastError.message}`));
          return;
        }

        const now = new Date().toISOString();
        const manifest = chrome.runtime.getManifest();

        const usageData: UsageData = result.usageData || {
          installDate: now,
          lastActiveDate: now,
          totalPushes: 0,
          authMethod: 'none',
          extensionVersion: manifest.version,
          errorCount: 0,
        };

        // Update version if it changed
        usageData.extensionVersion = manifest.version;

        chrome.storage.local.set({ usageData }, async () => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Failed to set usage data: ${chrome.runtime.lastError.message}`));
            return;
          }
          try {
            await this.setUninstallURL();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });
  }

  /**
   * Update usage statistics based on events
   */
  async updateUsageStats(
    eventType: string,
    data?: { authMethod?: UsageData['authMethod'] }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['usageData'], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Failed to get usage data: ${chrome.runtime.lastError.message}`));
          return;
        }

        const usageData: UsageData = result.usageData || this.getDefaultUsageData();

        usageData.lastActiveDate = new Date().toISOString();

        switch (eventType) {
          case 'push_completed':
            usageData.totalPushes++;
            break;
          case 'auth_method_changed':
            if (data?.authMethod) {
              usageData.authMethod = data.authMethod;
            }
            break;
        }

        chrome.storage.local.set({ usageData }, async () => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Failed to set usage data: ${chrome.runtime.lastError.message}`));
            return;
          }
          try {
            await this.setUninstallURL();
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    });
  }

  /**
   * Track errors for uninstall feedback
   */
  async trackError(error: Error, context: string): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(['errorLog', 'usageData'], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Failed to get error data: ${chrome.runtime.lastError.message}`));
          return;
        }

        const errorLog: ErrorLogEntry[] = result.errorLog || [];
        const usageData: UsageData = result.usageData || this.getDefaultUsageData();

        const errorEntry: ErrorLogEntry = {
          timestamp: new Date().toISOString(),
          message: error.message,
          context: context,
          stack: error.stack,
        };

        errorLog.push(errorEntry);

        // Keep only last 10 errors
        const recentErrors = errorLog.slice(-10);

        // Update usage data error count
        usageData.errorCount++;
        usageData.lastError = error.message;

        chrome.storage.local.set(
          {
            errorLog: recentErrors,
            usageData,
          },
          async () => {
            if (chrome.runtime.lastError) {
              reject(new Error(`Failed to set error data: ${chrome.runtime.lastError.message}`));
              return;
            }
            try {
              await this.setUninstallURL();
              resolve();
            } catch (error) {
              reject(error);
            }
          }
        );
      });
    });
  }

  /**
   * Set the uninstall URL with anonymous usage parameters
   */
  async setUninstallURL(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Get analytics preference from sync storage (same as AnalyticsToggle component)
      chrome.storage.sync.get(['analyticsEnabled'], (syncResult) => {
        if (chrome.runtime.lastError) {
          reject(
            new Error(`Failed to get analytics preference: ${chrome.runtime.lastError.message}`)
          );
          return;
        }

        const analyticsEnabled = syncResult.analyticsEnabled ?? true; // Default to true if not set

        // If analytics is disabled, clear the uninstall URL
        if (!analyticsEnabled) {
          chrome.runtime.setUninstallURL('', () => {
            if (chrome.runtime.lastError) {
              reject(
                new Error(`Failed to clear uninstall URL: ${chrome.runtime.lastError.message}`)
              );
              return;
            }
            resolve();
          });
          return;
        }

        // Get usage data from local storage
        chrome.storage.local.get(['usageData'], (localResult) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Failed to get usage data: ${chrome.runtime.lastError.message}`));
            return;
          }

          const usageData: UsageData = localResult.usageData || this.getDefaultUsageData();
          const manifest = chrome.runtime.getManifest();

          const params = new URLSearchParams({
            v: manifest.version,
            d: this.calculateDaysSinceInstall(usageData.installDate).toString(),
            p: usageData.totalPushes.toString(),
            a: usageData.authMethod,
            e: (usageData.errorCount > 0).toString(),
          });

          const uninstallUrl = `${this.UNINSTALL_FEEDBACK_BASE_URL}?${params.toString()}`;
          chrome.runtime.setUninstallURL(uninstallUrl, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(`Failed to set uninstall URL: ${chrome.runtime.lastError.message}`));
              return;
            }
            resolve();
          });
        });
      });
    });
  }

  /**
   * Calculate days since installation
   */
  private calculateDaysSinceInstall(installDate: string): number {
    try {
      const install = new Date(installDate);
      const now = new Date();

      // Check for invalid date
      if (isNaN(install.getTime())) {
        return 0;
      }

      // Calculate difference (negative if install date is in future)
      const diffTime = now.getTime() - install.getTime();

      // Return 0 for future dates
      if (diffTime < 0) {
        return 0;
      }

      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return diffDays;
    } catch {
      return 0;
    }
  }

  /**
   * Get default usage data structure
   */
  private getDefaultUsageData(): UsageData {
    const manifest = chrome.runtime.getManifest();
    return {
      installDate: new Date().toISOString(),
      lastActiveDate: new Date().toISOString(),
      totalPushes: 0,
      authMethod: 'none',
      extensionVersion: manifest.version,
      errorCount: 0,
    };
  }
}
