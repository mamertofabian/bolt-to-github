/**
 * Analytics utilities for the Bolt to GitHub extension
 * Provides convenient functions for tracking user interactions
 */

import { analytics } from '../../services/AnalyticsService';
import { createLogger } from './logger';

const logger = createLogger('Analytics');

/**
 * Send analytics event to background script (useful for content scripts and popup)
 */
export function sendAnalyticsToBackground(eventType: string, eventData: any): void {
  try {
    chrome.runtime.sendMessage({
      type: 'ANALYTICS_EVENT',
      eventType,
      eventData,
    });
  } catch (error) {
    logger.debug('Failed to send analytics to background:', error);
  }
}

/**
 * Common analytics events for the extension
 */
export const ANALYTICS_EVENTS = {
  // Extension lifecycle
  EXTENSION_INSTALLED: 'extension_installed',
  EXTENSION_UPDATED: 'extension_updated',
  EXTENSION_OPENED: 'extension_opened',

  // User onboarding
  SETUP_STARTED: 'setup_started',
  GITHUB_TOKEN_ADDED: 'github_token_added',
  SETUP_COMPLETED: 'setup_completed',

  // Bolt.new interactions
  BOLT_PAGE_DETECTED: 'bolt_page_detected',
  PROJECT_DETECTED: 'project_detected',
  DOWNLOAD_INITIATED: 'download_initiated',
  DOWNLOAD_COMPLETED: 'download_completed',
  DOWNLOAD_FAILED: 'download_failed',

  // GitHub operations
  REPO_CREATED: 'repo_created',
  FILES_UPLOADED: 'files_uploaded',
  COMMIT_CREATED: 'commit_created',
  PUSH_COMPLETED: 'push_completed',

  // User preferences
  SETTINGS_OPENED: 'settings_opened',
  SETTING_CHANGED: 'setting_changed',
  PRIVACY_TOGGLED: 'privacy_toggled',

  // Errors and issues
  AUTH_ERROR: 'auth_error',
  NETWORK_ERROR: 'network_error',
  PARSING_ERROR: 'parsing_error',
  UPLOAD_ERROR: 'upload_error',

  // Feature usage
  FILE_PREVIEW_OPENED: 'file_preview_opened',
  DIFF_COMPARISON_VIEWED: 'diff_comparison_viewed',
  MANUAL_SYNC_TRIGGERED: 'manual_sync_triggered',
  AUTO_SYNC_COMPLETED: 'auto_sync_completed',
} as const;

/**
 * Track extension installation or update
 */
export async function trackExtensionLifecycle(
  eventType: 'install' | 'update',
  version: string
): Promise<void> {
  await analytics.trackMilestone(
    eventType === 'install'
      ? ANALYTICS_EVENTS.EXTENSION_INSTALLED
      : ANALYTICS_EVENTS.EXTENSION_UPDATED,
    { version }
  );
}

/**
 * Track extension opening (popup or content script activation)
 */
export async function trackExtensionOpened(context: 'popup' | 'content_script'): Promise<void> {
  await analytics.trackExtensionEvent(ANALYTICS_EVENTS.EXTENSION_OPENED, { context });
}

/**
 * Track user onboarding progress
 */
export async function trackOnboardingStep(
  step: 'started' | 'token_added' | 'completed',
  metadata?: Record<string, any>
): Promise<void> {
  const eventMap = {
    started: ANALYTICS_EVENTS.SETUP_STARTED,
    token_added: ANALYTICS_EVENTS.GITHUB_TOKEN_ADDED,
    completed: ANALYTICS_EVENTS.SETUP_COMPLETED,
  };

  await analytics.trackMilestone(eventMap[step], metadata);
}

/**
 * Track Bolt.new project interactions
 */
export async function trackBoltProjectEvent(
  eventType: 'detected' | 'download_started' | 'download_completed' | 'download_failed',
  projectMetadata?: {
    projectName?: string;
    fileCount?: number;
    projectSize?: number;
    zipSize?: number;
  }
): Promise<void> {
  const eventMap = {
    detected: ANALYTICS_EVENTS.PROJECT_DETECTED,
    download_started: ANALYTICS_EVENTS.DOWNLOAD_INITIATED,
    download_completed: ANALYTICS_EVENTS.DOWNLOAD_COMPLETED,
    download_failed: ANALYTICS_EVENTS.DOWNLOAD_FAILED,
  };

  await analytics.trackExtensionEvent(eventMap[eventType], projectMetadata);
}

/**
 * Track GitHub repository operations
 */
export async function trackGitHubRepoOperation(
  operation: 'create' | 'upload' | 'commit' | 'push',
  success: boolean,
  metadata?: {
    repoName?: string;
    fileCount?: number;
    commitMessage?: string;
    isNewRepo?: boolean;
    errorType?: string;
  }
): Promise<void> {
  const operationMap = {
    create: 'repo_creation',
    upload: 'file_upload',
    commit: 'commit_creation',
    push: 'push_operation',
  };

  await analytics.trackGitHubOperation(operationMap[operation], success, metadata);
}

/**
 * Track user settings and preferences
 */
export async function trackUserPreference(
  action: 'settings_opened' | 'setting_changed' | 'analytics_toggled',
  details?: {
    settingName?: string;
    oldValue?: any;
    newValue?: any;
  }
): Promise<void> {
  await analytics.trackEvent({
    category: 'user_preferences',
    action,
    label: details ? JSON.stringify(details) : undefined,
  });
}

/**
 * Track feature usage
 */
export async function trackFeatureUsage(
  feature: 'file_preview' | 'diff_comparison' | 'manual_sync' | 'auto_sync',
  metadata?: Record<string, any>
): Promise<void> {
  const eventMap = {
    file_preview: ANALYTICS_EVENTS.FILE_PREVIEW_OPENED,
    diff_comparison: ANALYTICS_EVENTS.DIFF_COMPARISON_VIEWED,
    manual_sync: ANALYTICS_EVENTS.MANUAL_SYNC_TRIGGERED,
    auto_sync: ANALYTICS_EVENTS.AUTO_SYNC_COMPLETED,
  };

  await analytics.trackExtensionEvent(eventMap[feature], metadata);
}

/**
 * Track errors with context
 */
export async function trackError(
  errorType: 'auth' | 'network' | 'parsing' | 'upload' | 'unknown',
  error: Error | string,
  context?: string
): Promise<void> {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorStack = typeof error === 'string' ? undefined : error.stack;

  await analytics.trackError(
    new Error(errorMessage),
    `${errorType}${context ? `_${context}` : ''}`
  );

  // Also track as a categorized event for easier analysis
  await analytics.trackEvent({
    category: 'errors',
    action: `${errorType}_error`,
    label: `${context || 'unknown'}: ${errorMessage}`,
    value: 1,
  });
}

/**
 * Track performance metrics
 */
export async function trackPerformance(
  operation: string,
  duration: number,
  metadata?: Record<string, any>
): Promise<void> {
  await analytics.trackEvent({
    category: 'performance',
    action: 'operation_timing',
    label: operation,
    value: Math.round(duration),
  });

  if (metadata) {
    await analytics.trackExtensionEvent(`performance_${operation}`, {
      duration,
      ...metadata,
    });
  }
}

/**
 * Track user journey and conversion funnel
 */
export async function trackConversionFunnel(
  stage: 'discovery' | 'installation' | 'first_use' | 'successful_upload' | 'repeat_user',
  metadata?: Record<string, any>
): Promise<void> {
  await analytics.trackMilestone(`conversion_${stage}`, metadata);
}

/**
 * Track page views for different parts of the extension
 */
export async function trackPageView(
  page: 'popup' | 'options' | 'onboarding',
  metadata?: Record<string, any>
): Promise<void> {
  await analytics.trackPageView(
    `/${page}`,
    `Bolt to GitHub - ${page.charAt(0).toUpperCase() + page.slice(1)}`
  );

  if (metadata) {
    await analytics.trackExtensionEvent(`page_view_${page}`, metadata);
  }
}

/**
 * Utility to wrap async operations with analytics tracking
 */
export function withAnalytics<T extends any[], R>(
  operation: (...args: T) => Promise<R>,
  eventName: string,
  getMetadata?: (...args: T) => Record<string, any>
) {
  return async (...args: T): Promise<R> => {
    const startTime = Date.now();

    try {
      const result = await operation(...args);
      const duration = Date.now() - startTime;

      await trackPerformance(eventName, duration, getMetadata?.(...args));

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      await trackError('unknown', error as Error, eventName);
      await trackPerformance(`${eventName}_failed`, duration, getMetadata?.(...args));

      throw error;
    }
  };
}
