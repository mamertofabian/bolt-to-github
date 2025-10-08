import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../services/AnalyticsService', () => ({
  analytics: {
    trackMilestone: vi.fn().mockResolvedValue(undefined),
    trackExtensionEvent: vi.fn().mockResolvedValue(undefined),
    trackGitHubOperation: vi.fn().mockResolvedValue(undefined),
    trackEvent: vi.fn().mockResolvedValue(undefined),
    trackError: vi.fn().mockResolvedValue(undefined),
    trackPageView: vi.fn().mockResolvedValue(undefined),
    trackFeatureAdoption: vi.fn().mockResolvedValue(undefined),
    trackPerformance: vi.fn().mockResolvedValue(undefined),
    trackUserJourney: vi.fn().mockResolvedValue(undefined),
    trackOperationResult: vi.fn().mockResolvedValue(undefined),
    trackFeatureUsage: vi.fn().mockResolvedValue(undefined),
    trackDailyActiveUser: vi.fn().mockResolvedValue(undefined),
  },
}));

import { analytics } from '../../../services/AnalyticsService';
import {
  sendAnalyticsToBackground,
  ANALYTICS_EVENTS,
  trackExtensionLifecycle,
  trackExtensionOpened,
  trackOnboardingStep,
  trackBoltProjectEvent,
  trackGitHubRepoOperation,
  trackUserPreference,
  trackFeatureUsage,
  trackError,
  trackPerformance,
  trackConversionFunnel,
  trackPageView,
  trackFeatureAdoption,
  trackOperationPerformance,
  trackUserJourneyMilestone,
  trackOperationResult,
  trackFeatureUsageWithVersion,
  trackDailyActiveUser,
  withAnalytics,
} from '../analytics';

const mockChrome = {
  runtime: {
    sendMessage: vi.fn(),
    getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }),
  },
};

describe('analytics utilities - integration tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.chrome = mockChrome as unknown as typeof chrome;
  });

  describe('ANALYTICS_EVENTS', () => {
    it('should define extension lifecycle events', () => {
      expect(ANALYTICS_EVENTS.EXTENSION_INSTALLED).toBe('extension_installed');
      expect(ANALYTICS_EVENTS.EXTENSION_UPDATED).toBe('extension_updated');
      expect(ANALYTICS_EVENTS.EXTENSION_OPENED).toBe('extension_opened');
    });

    it('should define onboarding events', () => {
      expect(ANALYTICS_EVENTS.SETUP_STARTED).toBe('setup_started');
      expect(ANALYTICS_EVENTS.GITHUB_TOKEN_ADDED).toBe('github_token_added');
      expect(ANALYTICS_EVENTS.SETUP_COMPLETED).toBe('setup_completed');
    });

    it('should define project events', () => {
      expect(ANALYTICS_EVENTS.PROJECT_DETECTED).toBe('project_detected');
      expect(ANALYTICS_EVENTS.DOWNLOAD_INITIATED).toBe('download_initiated');
      expect(ANALYTICS_EVENTS.DOWNLOAD_COMPLETED).toBe('download_completed');
      expect(ANALYTICS_EVENTS.DOWNLOAD_FAILED).toBe('download_failed');
    });

    it('should define GitHub operation events', () => {
      expect(ANALYTICS_EVENTS.REPO_CREATED).toBe('repo_created');
      expect(ANALYTICS_EVENTS.FILES_UPLOADED).toBe('files_uploaded');
      expect(ANALYTICS_EVENTS.COMMIT_CREATED).toBe('commit_created');
      expect(ANALYTICS_EVENTS.PUSH_COMPLETED).toBe('push_completed');
    });

    it('should define error events', () => {
      expect(ANALYTICS_EVENTS.AUTH_ERROR).toBe('auth_error');
      expect(ANALYTICS_EVENTS.NETWORK_ERROR).toBe('network_error');
      expect(ANALYTICS_EVENTS.PARSING_ERROR).toBe('parsing_error');
      expect(ANALYTICS_EVENTS.UPLOAD_ERROR).toBe('upload_error');
    });
  });

  describe('sendAnalyticsToBackground', () => {
    it('should send message to chrome runtime with correct format', () => {
      const eventData = { action: 'click', target: 'button' };

      sendAnalyticsToBackground('test_event', eventData);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'ANALYTICS_EVENT',
        eventType: 'test_event',
        eventData,
      });
    });

    it('should handle chrome runtime errors gracefully', () => {
      mockChrome.runtime.sendMessage.mockImplementation(() => {
        throw new Error('Extension context invalidated');
      });

      expect(() => sendAnalyticsToBackground('test_event', {})).not.toThrow();
    });
  });

  describe('trackExtensionLifecycle', () => {
    it('should track installation with version', async () => {
      await trackExtensionLifecycle('install', '1.0.0');

      expect(analytics.trackMilestone).toHaveBeenCalledWith('extension_installed', {
        version: '1.0.0',
      });
    });

    it('should track update with version', async () => {
      await trackExtensionLifecycle('update', '2.0.0');

      expect(analytics.trackMilestone).toHaveBeenCalledWith('extension_updated', {
        version: '2.0.0',
      });
    });
  });

  describe('trackExtensionOpened', () => {
    it('should track popup context', async () => {
      await trackExtensionOpened('popup');

      expect(analytics.trackExtensionEvent).toHaveBeenCalledWith('extension_opened', {
        context: 'popup',
      });
    });

    it('should track content script context', async () => {
      await trackExtensionOpened('content_script');

      expect(analytics.trackExtensionEvent).toHaveBeenCalledWith('extension_opened', {
        context: 'content_script',
      });
    });
  });

  describe('trackOnboardingStep', () => {
    it('should track setup started', async () => {
      await trackOnboardingStep('started');

      expect(analytics.trackMilestone).toHaveBeenCalledWith('setup_started', undefined);
    });

    it('should track token added with metadata', async () => {
      await trackOnboardingStep('token_added', { tokenType: 'classic' });

      expect(analytics.trackMilestone).toHaveBeenCalledWith('github_token_added', {
        tokenType: 'classic',
      });
    });

    it('should track setup completed', async () => {
      await trackOnboardingStep('completed');

      expect(analytics.trackMilestone).toHaveBeenCalledWith('setup_completed', undefined);
    });
  });

  describe('trackBoltProjectEvent', () => {
    it('should track project detected with metadata', async () => {
      await trackBoltProjectEvent('detected', { projectName: 'my-app', fileCount: 10 });

      expect(analytics.trackExtensionEvent).toHaveBeenCalledWith('project_detected', {
        projectName: 'my-app',
        fileCount: 10,
      });
    });

    it('should track download lifecycle', async () => {
      await trackBoltProjectEvent('download_started', { projectSize: 1024 });
      await trackBoltProjectEvent('download_completed', { zipSize: 512 });

      expect(analytics.trackExtensionEvent).toHaveBeenCalledWith('download_initiated', {
        projectSize: 1024,
      });
      expect(analytics.trackExtensionEvent).toHaveBeenCalledWith('download_completed', {
        zipSize: 512,
      });
    });

    it('should track download failure', async () => {
      await trackBoltProjectEvent('download_failed');

      expect(analytics.trackExtensionEvent).toHaveBeenCalledWith('download_failed', undefined);
    });
  });

  describe('trackGitHubRepoOperation', () => {
    it('should track successful repo creation', async () => {
      await trackGitHubRepoOperation('create', true, { repoName: 'test-repo' });

      expect(analytics.trackGitHubOperation).toHaveBeenCalledWith('repo_creation', true, {
        repoName: 'test-repo',
      });
    });

    it('should track failed file upload', async () => {
      await trackGitHubRepoOperation('upload', false, { errorType: 'network_error' });

      expect(analytics.trackGitHubOperation).toHaveBeenCalledWith('file_upload', false, {
        errorType: 'network_error',
      });
    });

    it('should track complete push workflow', async () => {
      await trackGitHubRepoOperation('upload', true, { fileCount: 5 });
      await trackGitHubRepoOperation('commit', true, { commitMessage: 'Initial commit' });
      await trackGitHubRepoOperation('push', true);

      expect(analytics.trackGitHubOperation).toHaveBeenCalledTimes(3);
    });
  });

  describe('trackUserPreference', () => {
    it('should track settings opened', async () => {
      await trackUserPreference('settings_opened');

      expect(analytics.trackEvent).toHaveBeenCalledWith({
        category: 'user_preferences',
        action: 'settings_opened',
        label: undefined,
      });
    });

    it('should track setting changed with details', async () => {
      await trackUserPreference('setting_changed', {
        settingName: 'autoPush',
        oldValue: false,
        newValue: true,
      });

      expect(analytics.trackEvent).toHaveBeenCalledWith({
        category: 'user_preferences',
        action: 'setting_changed',
        label: JSON.stringify({ settingName: 'autoPush', oldValue: false, newValue: true }),
      });
    });
  });

  describe('trackFeatureUsage', () => {
    it('should track file preview', async () => {
      await trackFeatureUsage('file_preview', { fileName: 'App.svelte' });

      expect(analytics.trackExtensionEvent).toHaveBeenCalledWith('file_preview_opened', {
        fileName: 'App.svelte',
      });
    });

    it('should track diff comparison', async () => {
      await trackFeatureUsage('diff_comparison', { filesCompared: 3 });

      expect(analytics.trackExtensionEvent).toHaveBeenCalledWith('diff_comparison_viewed', {
        filesCompared: 3,
      });
    });

    it('should track sync operations', async () => {
      await trackFeatureUsage('manual_sync');
      await trackFeatureUsage('auto_sync', { filesUpdated: 5 });

      expect(analytics.trackExtensionEvent).toHaveBeenCalledWith(
        'manual_sync_triggered',
        undefined
      );
      expect(analytics.trackExtensionEvent).toHaveBeenCalledWith('auto_sync_completed', {
        filesUpdated: 5,
      });
    });
  });

  describe('trackError', () => {
    it('should track auth error', async () => {
      const error = new Error('Invalid token');

      await trackError('auth', error, 'login');

      expect(analytics.trackError).toHaveBeenCalledWith(error, 'auth_login');
      expect(analytics.trackEvent).toHaveBeenCalledWith({
        category: 'errors',
        action: 'auth_error',
        label: 'login: Invalid token',
        value: 1,
      });
    });

    it('should track error from string message', async () => {
      await trackError('network', 'Connection timeout', 'fetch');

      expect(analytics.trackError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Connection timeout' }),
        'network_fetch'
      );
    });

    it('should handle error without context', async () => {
      await trackError('parsing', new Error('Parse failed'));

      expect(analytics.trackError).toHaveBeenCalled();
      expect(analytics.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'parsing_error',
          label: expect.stringContaining('Parse failed'),
        })
      );
    });
  });

  describe('trackPerformance', () => {
    it('should track operation duration', async () => {
      await trackPerformance('file_upload', 1500, { fileCount: 10 });

      expect(analytics.trackEvent).toHaveBeenCalledWith({
        category: 'performance',
        action: 'operation_timing',
        label: 'file_upload',
        value: 1500,
      });
      expect(analytics.trackExtensionEvent).toHaveBeenCalledWith('performance_file_upload', {
        duration: 1500,
        fileCount: 10,
      });
    });

    it('should round duration values', async () => {
      await trackPerformance('parsing', 123.456);

      expect(analytics.trackEvent).toHaveBeenCalledWith(expect.objectContaining({ value: 123 }));
    });
  });

  describe('trackConversionFunnel', () => {
    it('should track user journey through funnel', async () => {
      await trackConversionFunnel('discovery');
      await trackConversionFunnel('installation', { source: 'chrome_store' });
      await trackConversionFunnel('first_use');
      await trackConversionFunnel('successful_upload');

      expect(analytics.trackMilestone).toHaveBeenCalledWith('conversion_discovery', undefined);
      expect(analytics.trackMilestone).toHaveBeenCalledWith('conversion_installation', {
        source: 'chrome_store',
      });
      expect(analytics.trackMilestone).toHaveBeenCalledWith('conversion_first_use', undefined);
      expect(analytics.trackMilestone).toHaveBeenCalledWith(
        'conversion_successful_upload',
        undefined
      );
    });
  });

  describe('trackPageView', () => {
    it('should track popup page view', async () => {
      await trackPageView('popup');

      expect(analytics.trackPageView).toHaveBeenCalledWith('/popup', 'Bolt to GitHub - Popup');
    });

    it('should track page views with metadata', async () => {
      await trackPageView('options', { section: 'github_settings' });

      expect(analytics.trackPageView).toHaveBeenCalledWith('/options', 'Bolt to GitHub - Options');
      expect(analytics.trackExtensionEvent).toHaveBeenCalledWith('page_view_options', {
        section: 'github_settings',
      });
    });
  });

  describe('trackFeatureAdoption', () => {
    it('should track feature adoption and rejection', async () => {
      await trackFeatureAdoption('auto_push', true);
      await trackFeatureAdoption('github_app_auth', false);

      expect(analytics.trackFeatureAdoption).toHaveBeenCalledWith('auto_push', true);
      expect(analytics.trackFeatureAdoption).toHaveBeenCalledWith('github_app_auth', false);
    });
  });

  describe('trackOperationPerformance', () => {
    it('should track operation with time range', async () => {
      const startTime = Date.now();
      const endTime = startTime + 1000;

      await trackOperationPerformance('upload', startTime, endTime, { fileCount: 5 });

      expect(analytics.trackPerformance).toHaveBeenCalledWith('upload', startTime, endTime, {
        fileCount: 5,
      });
    });
  });

  describe('trackUserJourneyMilestone', () => {
    it('should track journey milestones', async () => {
      await trackUserJourneyMilestone('onboarding', 'completed_setup', { step: 1 });

      expect(analytics.trackUserJourney).toHaveBeenCalledWith('onboarding', 'completed_setup', {
        step: 1,
      });
    });
  });

  describe('trackOperationResult', () => {
    it('should track operation success and failure', async () => {
      await trackOperationResult('push', true, { duration: 1500 });
      await trackOperationResult('clone', false, { errorType: 'network' });

      expect(analytics.trackOperationResult).toHaveBeenCalledWith('push', true, { duration: 1500 });
      expect(analytics.trackOperationResult).toHaveBeenCalledWith('clone', false, {
        errorType: 'network',
      });
    });
  });

  describe('trackFeatureUsageWithVersion', () => {
    it('should track feature usage with version info', async () => {
      await trackFeatureUsageWithVersion('auto_sync', { version: '1.0.0' });

      expect(analytics.trackFeatureUsage).toHaveBeenCalledWith('auto_sync', { version: '1.0.0' });
    });
  });

  describe('trackDailyActiveUser', () => {
    it('should track daily active user', async () => {
      await trackDailyActiveUser();

      expect(analytics.trackDailyActiveUser).toHaveBeenCalled();
    });
  });

  describe('withAnalytics wrapper', () => {
    it('should wrap async operation and track success', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const wrapped = withAnalytics(operation, 'test_op');

      const result = await wrapped('arg1', 'arg2');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledWith('arg1', 'arg2');
      expect(analytics.trackPerformance).toHaveBeenCalledWith(
        'test_op',
        expect.any(Number),
        expect.any(Number),
        undefined
      );
      expect(analytics.trackOperationResult).toHaveBeenCalledWith('test_op', true, undefined);
    });

    it('should track operation with metadata', async () => {
      const operation = vi.fn().mockResolvedValue({ data: 'result' });
      const getMetadata = vi.fn().mockReturnValue({ param: 'value' });
      const wrapped = withAnalytics(operation, 'complex_op', getMetadata);

      await wrapped('input');

      expect(getMetadata).toHaveBeenCalledWith('input');
      expect(analytics.trackPerformance).toHaveBeenCalledWith(
        'complex_op',
        expect.any(Number),
        expect.any(Number),
        { param: 'value' }
      );
      expect(analytics.trackOperationResult).toHaveBeenCalledWith('complex_op', true, {
        param: 'value',
      });
    });

    it('should track and rethrow errors', async () => {
      const error = new Error('Operation failed');
      const operation = vi.fn().mockRejectedValue(error);
      const wrapped = withAnalytics(operation, 'failing_op');

      await expect(wrapped()).rejects.toThrow('Operation failed');

      expect(analytics.trackError).toHaveBeenCalledWith(error, 'unknown_failing_op');
      expect(analytics.trackPerformance).toHaveBeenCalledWith(
        'failing_op_failed',
        expect.any(Number),
        expect.any(Number),
        undefined
      );
      expect(analytics.trackOperationResult).toHaveBeenCalledWith('failing_op', false, undefined);
    });

    it('should preserve operation return value type', async () => {
      const operation = vi.fn().mockResolvedValue(42);
      const wrapped = withAnalytics(operation, 'typed_op');

      const result = await wrapped();

      expect(result).toBe(42);
      expect(typeof result).toBe('number');
    });
  });

  describe('integration workflows', () => {
    it('should support complete onboarding flow', async () => {
      await trackOnboardingStep('started');
      await trackExtensionOpened('popup');
      await trackOnboardingStep('token_added', { tokenType: 'fine_grained' });
      await trackOnboardingStep('completed');
      await trackConversionFunnel('first_use');

      expect(analytics.trackMilestone).toHaveBeenCalledTimes(4);
      expect(analytics.trackExtensionEvent).toHaveBeenCalledTimes(1);
    });

    it('should support complete upload workflow', async () => {
      await trackBoltProjectEvent('detected', { projectName: 'my-app' });
      await trackBoltProjectEvent('download_started', { projectSize: 1024 });
      await trackBoltProjectEvent('download_completed', { zipSize: 512 });
      await trackGitHubRepoOperation('create', true, { repoName: 'my-app' });
      await trackGitHubRepoOperation('upload', true, { fileCount: 10 });
      await trackGitHubRepoOperation('commit', true);
      await trackGitHubRepoOperation('push', true);
      await trackConversionFunnel('successful_upload');

      expect(analytics.trackExtensionEvent).toHaveBeenCalledTimes(3);
      expect(analytics.trackGitHubOperation).toHaveBeenCalledTimes(4);
      expect(analytics.trackMilestone).toHaveBeenCalledTimes(1);
    });

    it('should support error recovery flow', async () => {
      await trackGitHubRepoOperation('upload', false, { errorType: 'network' });
      await trackError('network', 'Connection timeout', 'upload');
      await trackGitHubRepoOperation('upload', true, { fileCount: 10 });

      expect(analytics.trackGitHubOperation).toHaveBeenCalledTimes(2);
      expect(analytics.trackError).toHaveBeenCalledTimes(1);
    });
  });
});
