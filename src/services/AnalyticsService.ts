/**
 * Analytics Service for Chrome Extension
 * Uses Google Analytics Measurement Protocol to track user interactions
 * without violating Chrome Web Store policies (no remote scripts)
 * Service Worker Compatible - No DOM dependencies
 */

import { createLogger } from '../lib/utils/logger';

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

export class AnalyticsService {
  private static instance: AnalyticsService;
  private config: AnalyticsConfig | null = null;
  private readonly MEASUREMENT_PROTOCOL_URL = 'https://www.google-analytics.com/mp/collect';
  private readonly GA4_MEASUREMENT_ID = 'G-6J0TXX2XW0'; // Your GA4 Measurement ID
  private readonly API_SECRET: string;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    // Don't initialize immediately to avoid DOM issues
    // Safe environment variable access for service workers
    try {
      this.API_SECRET = import.meta.env?.VITE_GA4_API_SECRET || 'SDSrX58bTAmEqVg2awosDA';
    } catch (error) {
      logger.debug('Could not access environment variables:', error);
      this.API_SECRET = 'SDSrX58bTAmEqVg2awosDA';
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
  public async trackExtensionEvent(
    eventType: string,
    details?: Record<string, any>
  ): Promise<void> {
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
    details?: Record<string, any>
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
  public async trackMilestone(milestone: string, metadata?: Record<string, any>): Promise<void> {
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
    await this.trackEvent({
      category: 'errors',
      action: 'extension_error',
      label: `${context || 'unknown'}: ${error.message}`,
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

  private async sendEvent(eventData: any): Promise<void> {
    if (!this.config) {
      await this.initializeConfig();
    }

    if (!this.config || !this.config.enabled) {
      return;
    }

    try {
      const payload = {
        client_id: this.config.clientId,
        events: [eventData],
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
  public async getAnalyticsSummary(): Promise<Record<string, any>> {
    try {
      const result = await chrome.storage.local.get(['analyticsClientId', 'lastAnalyticsSync']);
      return {
        clientId: result.analyticsClientId,
        lastSync: result.lastAnalyticsSync,
        enabled: await this.isAnalyticsEnabled(),
      };
    } catch (error) {
      logger.error('Failed to get analytics summary:', error);
      return {};
    }
  }
}

// Export singleton instance
export const analytics = AnalyticsService.getInstance();
