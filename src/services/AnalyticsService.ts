/**
 * Analytics Service for Chrome Extension
 * Uses Google Analytics Measurement Protocol to track user interactions
 * without violating Chrome Web Store policies (no remote scripts)
 * Service Worker Compatible - No DOM dependencies
 */

import { createLogger } from '../lib/utils/logger';
import { getAnalyticsApiSecret } from '../config/analytics';

const logger = createLogger('AnalyticsService');

interface AnalyticsEvent {
  action: string;
  category: string;
  label?: string;
  value?: number;
}

interface AnalyticsConfig {
  trackingId: string;
  clientId: string;
  enabled: boolean;
}

// Define specific types for analytics data
interface AnalyticsEventData {
  name: string;
  params: {
    [key: string]: string | number | boolean | undefined;
  };
}

interface AnalyticsDetails {
  [key: string]: string | number | boolean | undefined;
}

interface AnalyticsSummary {
  clientId?: string;
  lastSync?: string;
  enabled: boolean;
}

export class AnalyticsService {
  private static instance: AnalyticsService;
  private config: AnalyticsConfig | null = null;
  private readonly MEASUREMENT_PROTOCOL_URL = 'https://www.google-analytics.com/mp/collect';
  private readonly GA4_MEASUREMENT_ID = 'G-6J0TXX2XW0'; // Your GA4 Measurement ID
  private readonly API_SECRET: string;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    // Don't initialize immediately to avoid DOM issues
    // Get API secret from environment variable
    this.API_SECRET = getAnalyticsApiSecret();

    if (!this.API_SECRET) {
      logger.warn('GA4 API_SECRET not configured. Analytics will be disabled.');
    }
  }

  public static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  private async initializeConfig(): Promise<void> {
    // Use a promise to ensure we only initialize once
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._initializeConfig();
    return this.initPromise;
  }

  private async _initializeConfig(): Promise<void> {
    try {
      // Get or generate client ID
      const clientId = await this.getOrCreateClientId();

      // Check if analytics is enabled (user consent)
      let enabled = true; // Default to true

      try {
        const result = await chrome.storage.sync.get(['analyticsEnabled']);

        // Be explicit about the stored value
        if ('analyticsEnabled' in result) {
          enabled = Boolean(result.analyticsEnabled);
        }
      } catch (error) {
        logger.debug('Could not access storage for analytics preference:', error);
      }

      this.config = {
        trackingId: this.GA4_MEASUREMENT_ID,
        clientId,
        enabled,
      };
    } catch (error) {
      logger.error('Failed to initialize analytics config:', error);
      // Fallback config
      this.config = {
        trackingId: this.GA4_MEASUREMENT_ID,
        clientId: this.generateClientId(),
        enabled: true,
      };
    }
  }

  private async getOrCreateClientId(): Promise<string> {
    try {
      const result = await chrome.storage.local.get(['analyticsClientId']);

      if (result.analyticsClientId) {
        return result.analyticsClientId;
      }

      // Generate new client ID
      const clientId = this.generateClientId();
      await chrome.storage.local.set({ analyticsClientId: clientId });
      return clientId;
    } catch (error) {
      logger.error('Failed to get/create client ID:', error);
      return this.generateClientId();
    }
  }

  private generateClientId(): string {
    // Generate a UUID-like client ID
    // Use crypto.randomUUID if available (modern browsers), otherwise fallback
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    // Fallback UUID generation for service workers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  public async setAnalyticsEnabled(enabled: boolean): Promise<void> {
    try {
      await chrome.storage.sync.set({ analyticsEnabled: enabled });

      if (this.config) {
        this.config.enabled = enabled;
      }

      // Only track the analytics_enabled event if we're enabling analytics
      // and avoid recursive calls by calling the background service directly
      if (enabled) {
        try {
          // Use background service for tracking to avoid potential recursion
          chrome.runtime.sendMessage({
            type: 'ANALYTICS_EVENT',
            eventType: 'user_preference',
            eventData: {
              action: 'analytics_enabled',
              details: { enabled: true },
            },
          });
        } catch (error) {
          logger.debug('Could not send analytics enabled event:', error);
        }
      }
    } catch (error) {
      logger.error('Failed to set analytics preference:', error);
      throw error; // Re-throw so the UI can handle it
    }
  }

  public async isAnalyticsEnabled(): Promise<boolean> {
    if (!this.config) {
      await this.initializeConfig();
    }
    return this.config?.enabled ?? true;
  }

  /**
   * Track a page view
   */
  public async trackPageView(pagePath: string, pageTitle?: string): Promise<void> {
    if (!(await this.isAnalyticsEnabled())) return;

    try {
      const eventData = {
        name: 'page_view',
        params: {
          page_location: `chrome-extension://${chrome.runtime.id}${pagePath}`,
          page_title: pageTitle || 'Bolt to GitHub Extension',
          engagement_time_msec: 1,
        },
      };

      await this.sendEvent(eventData);
    } catch (error) {
      logger.error('Failed to track page view:', error);
    }
  }

  /**
   * Track a custom event
   */
  public async trackEvent(event: AnalyticsEvent): Promise<void> {
    if (!(await this.isAnalyticsEnabled())) return;

    try {
      const eventData = {
        name: this.sanitizeEventName(event.action),
        params: {
          event_category: event.category,
          event_label: event.label,
          value: event.value,
          custom_parameter_action: event.action,
        },
      };

      await this.sendEvent(eventData);
    } catch (error) {
      logger.error('Failed to track event:', error);
    }
  }

  /**
   * Track specific extension events
   */
  public async trackExtensionEvent(eventType: string, details?: AnalyticsDetails): Promise<void> {
    await this.trackEvent({
      category: 'extension_usage',
      action: eventType,
      label: details ? JSON.stringify(details) : undefined,
    });
  }

  /**
   * Track GitHub operations
   */
  public async trackGitHubOperation(
    operation: string,
    success: boolean,
    details?: AnalyticsDetails
  ): Promise<void> {
    await this.trackEvent({
      category: 'github_operations',
      action: `${operation}_${success ? 'success' : 'failure'}`,
      label: details ? JSON.stringify(details) : undefined,
      value: success ? 1 : 0,
    });
  }

  /**
   * Track user journey milestones
   */
  public async trackMilestone(milestone: string, metadata?: AnalyticsDetails): Promise<void> {
    await this.trackEvent({
      category: 'user_journey',
      action: milestone,
      label: metadata ? JSON.stringify(metadata) : undefined,
    });
  }

  /**
   * Track errors for debugging
   */
  public async trackError(error: Error, context?: string): Promise<void> {
    const version = chrome.runtime.getManifest().version;
    await this.trackEvent({
      category: 'errors',
      action: 'extension_error',
      label: `${context || 'unknown'}: ${error.message} (v${version})`,
      value: 1,
    });
  }

  private sanitizeEventName(name: string): string {
    // GA4 event names must be 40 chars or less, start with letter, and contain only letters, numbers, and underscores
    return name
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^[^a-z]/, 'event_')
      .substring(0, 40);
  }

  private async sendEvent(eventData: AnalyticsEventData): Promise<void> {
    if (!this.config) {
      await this.initializeConfig();
    }

    if (!this.config || !this.config.enabled || !this.API_SECRET) {
      return;
    }

    try {
      // Always include app version in event params
      const version = chrome.runtime.getManifest().version;
      const enhancedEventData = {
        ...eventData,
        params: {
          ...eventData.params,
          app_version: version,
        },
      };

      const payload = {
        client_id: this.config.clientId,
        events: [enhancedEventData],
      };

      const url = `${this.MEASUREMENT_PROTOCOL_URL}?measurement_id=${this.GA4_MEASUREMENT_ID}&api_secret=${this.API_SECRET}`;

      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        mode: 'no-cors', // Prevents CORS preflight requests
      });
    } catch (error) {
      // Silently fail to not disrupt extension functionality
      logger.debug('Analytics event send failed (this is expected in some contexts):', error);
    }
  }

  /**
   * Test method to verify analytics works in service worker context
   */
  public async testServiceWorkerCompatibility(): Promise<boolean> {
    try {
      // Test basic functionality without DOM access
      const clientId = this.generateClientId();
      logger.info('Analytics service worker test - Client ID generated:', clientId);

      // Test config initialization
      await this.initializeConfig();
      logger.info('Analytics service worker test - Config initialized');

      return true;
    } catch (error) {
      logger.error('Analytics service worker compatibility test failed:', error);
      return false;
    }
  }

  /**
   * Get analytics summary for user
   */
  public async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    try {
      const result = await chrome.storage.local.get(['analyticsClientId', 'lastAnalyticsSync']);
      return {
        clientId: result.analyticsClientId,
        lastSync: result.lastAnalyticsSync,
        enabled: await this.isAnalyticsEnabled(),
      };
    } catch (error) {
      logger.error('Failed to get analytics summary:', error);
      return { enabled: false };
    }
  }

  /**
   * Track version changes (upgrades/downgrades)
   */
  public async trackVersionChange(oldVersion: string, newVersion: string): Promise<void> {
    const comparison = this.compareVersions(oldVersion, newVersion);

    // Don't track if versions are the same
    if (comparison === 0) {
      return;
    }

    const isUpgrade = comparison < 0;
    await this.trackEvent({
      category: 'version_tracking',
      action: isUpgrade ? 'version_upgrade' : 'version_downgrade',
      label: JSON.stringify({ from: oldVersion, to: newVersion }),
    });
  }

  /**
   * Track feature adoption
   */
  public async trackFeatureAdoption(feature: string, adopted: boolean): Promise<void> {
    await this.trackEvent({
      category: 'feature_adoption',
      action: `${feature}_${adopted ? 'adopted' : 'abandoned'}`,
    });
  }

  /**
   * Track performance metrics
   */
  public async trackPerformance(
    operation: string,
    startTime: number,
    endTime: number,
    metadata?: AnalyticsDetails
  ): Promise<void> {
    const duration = endTime - startTime;
    await this.trackEvent({
      category: 'performance',
      action: `${operation}_duration`,
      label: metadata ? JSON.stringify(metadata) : undefined,
      value: duration,
    });
  }

  /**
   * Track user journey milestones with enhanced metadata
   */
  public async trackUserJourney(
    journey: string,
    milestone: string,
    metadata?: AnalyticsDetails
  ): Promise<void> {
    await this.trackEvent({
      category: 'user_journey',
      action: `${journey}_${milestone}`,
      label: metadata ? JSON.stringify(metadata) : undefined,
    });
  }

  /**
   * Track operation results with detailed context
   */
  public async trackOperationResult(
    operation: string,
    success: boolean,
    metadata?: AnalyticsDetails
  ): Promise<void> {
    await this.trackEvent({
      category: 'operation_results',
      action: `${operation}_${success ? 'success' : 'failure'}`,
      label: metadata ? JSON.stringify(metadata) : undefined,
      value: success ? 1 : 0,
    });
  }

  /**
   * Track daily active users with version
   */
  public async trackDailyActiveUser(): Promise<void> {
    const version = chrome.runtime.getManifest().version;
    await this.trackEvent({
      category: 'engagement',
      action: 'daily_active_user',
      label: JSON.stringify({ app_version: version }),
    });
  }

  /**
   * Track feature usage with version
   */
  public async trackFeatureUsage(feature: string, metadata?: AnalyticsDetails): Promise<void> {
    const version = chrome.runtime.getManifest().version;
    await this.trackEvent({
      category: 'feature_usage',
      action: `${feature}_used`,
      label: JSON.stringify({ ...metadata, app_version: version }),
    });
  }

  /**
   * Compare version strings
   */
  private compareVersions(v1: string, v2: string): number {
    // Validate inputs
    if (!v1 || !v2 || typeof v1 !== 'string' || typeof v2 !== 'string') {
      return 0; // Consider equal if invalid
    }

    // Extract numeric parts only, ignoring pre-release identifiers
    const cleanVersion = (v: string) => v.split('-')[0];
    const parts1 = cleanVersion(v1)
      .split('.')
      .map((part) => {
        const num = parseInt(part, 10);
        return isNaN(num) ? 0 : num;
      });
    const parts2 = cleanVersion(v2)
      .split('.')
      .map((part) => {
        const num = parseInt(part, 10);
        return isNaN(num) ? 0 : num;
      });

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;

      if (part1 < part2) return -1;
      if (part1 > part2) return 1;
    }

    return 0;
  }
}

// Export singleton instance
export const analytics = AnalyticsService.getInstance();
