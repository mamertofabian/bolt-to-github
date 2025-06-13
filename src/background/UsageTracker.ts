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
    return new Promise((resolve) => {
      chrome.storage.local.get(['usageData'], (result) => {
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

        chrome.storage.local.set({ usageData }, () => {
          this.setUninstallURL();
          resolve();
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
    return new Promise((resolve) => {
      chrome.storage.local.get(['usageData'], (result) => {
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

        chrome.storage.local.set({ usageData }, () => {
          this.setUninstallURL();
          resolve();
        });
      });
    });
  }

  /**
   * Track errors for uninstall feedback
   * Sanitizes error messages to prevent exposure of sensitive information
   */
  async trackError(error: Error, context: string): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['errorLog', 'usageData'], (result) => {
        const errorLog: ErrorLogEntry[] = result.errorLog || [];
        const usageData: UsageData = result.usageData || this.getDefaultUsageData();

        const errorEntry: ErrorLogEntry = {
          timestamp: new Date().toISOString(),
          message: this.sanitizeErrorMessage(error.message),
          context: context,
          stack: this.sanitizeStackTrace(error.stack),
        };

        errorLog.push(errorEntry);

        // Keep only last 10 errors
        const recentErrors = errorLog.slice(-10);

        // Update usage data error count
        usageData.errorCount++;
        usageData.lastError = this.sanitizeErrorMessage(error.message);

        chrome.storage.local.set(
          {
            errorLog: recentErrors,
            usageData,
          },
          () => {
            this.setUninstallURL();
            resolve();
          }
        );
      });
    });
  }

  /**
   * Set the uninstall URL with anonymous usage parameters
   */
  async setUninstallURL(): Promise<void> {
    return new Promise((resolve) => {
      // Get analytics preference from sync storage (same as AnalyticsToggle component)
      chrome.storage.sync.get(['analyticsEnabled'], (syncResult) => {
        const analyticsEnabled = syncResult.analyticsEnabled ?? true; // Default to true if not set

        // If analytics is disabled, clear the uninstall URL
        if (!analyticsEnabled) {
          chrome.runtime.setUninstallURL('');
          resolve();
          return;
        }

        // Get usage data from local storage
        chrome.storage.local.get(['usageData'], (localResult) => {
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
          chrome.runtime.setUninstallURL(uninstallUrl);
          resolve();
        });
      });
    });
  }

  /**
   * Sanitize error messages to remove sensitive information
   */
  private sanitizeErrorMessage(message: string): string {
    if (!message) return '';

    // Remove file paths (Windows and Unix-like)
    let sanitized = message.replace(/[C-Z]:[\\\/][^:\s]+/g, '[FILE_PATH]');
    sanitized = sanitized.replace(/\/(?:[^\/\s:]+\/)*[^\/\s:]+/g, '[FILE_PATH]');

    // Remove tokens and keys (patterns like token=, key=, etc.)
    sanitized = sanitized.replace(
      /\b(token|key|password|secret|auth|bearer|api[_-]?key)[=:]\s*[^\s,;]+/gi,
      '$1=[REDACTED]'
    );

    // Remove GitHub URLs with tokens
    sanitized = sanitized.replace(
      /https:\/\/[^@\s]+@github\.com/g,
      'https://[REDACTED]@github.com'
    );

    // Remove URLs with credentials
    sanitized = sanitized.replace(/https?:\/\/[^:\s]+:[^@\s]+@/g, 'https://[REDACTED]:[REDACTED]@');

    // Remove hash-like strings (potential tokens)
    sanitized = sanitized.replace(/\b[a-fA-F0-9]{20,}\b/g, '[HASH]');

    // Remove email addresses
    sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

    return sanitized;
  }

  /**
   * Sanitize stack traces to remove sensitive information
   */
  private sanitizeStackTrace(stack?: string): string | undefined {
    if (!stack) return undefined;

    // Split stack trace into lines and sanitize each line
    const lines = stack.split('\n');
    const sanitizedLines = lines.map((line) => {
      // Remove file paths from stack trace lines
      let sanitized = line.replace(/[C-Z]:[\\\/][^:\s)]+/g, '[FILE_PATH]');
      sanitized = sanitized.replace(/\/[^:\s)]+/g, '[FILE_PATH]');

      // Keep function names and line numbers but remove paths
      sanitized = sanitized.replace(/(at\s+[^(]+\()[^)]+(\))/g, '$1[FILE_PATH]$2');

      return sanitized;
    });

    return sanitizedLines.join('\n');
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
