import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockChrome = {
  runtime: {
    sendMessage: vi.fn(),
    getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }),
    id: 'test-extension-id',
  },
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    sync: {
      get: vi.fn().mockResolvedValue({ analyticsEnabled: true }),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
};

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
});

global.chrome = mockChrome as never;

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

describe('analytics utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: new Date('2024-01-01T00:00:00.000Z') });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ANALYTICS_EVENTS constants', () => {
    it('should define all required event types', () => {
      expect(ANALYTICS_EVENTS.EXTENSION_INSTALLED).toBe('extension_installed');
      expect(ANALYTICS_EVENTS.EXTENSION_UPDATED).toBe('extension_updated');
      expect(ANALYTICS_EVENTS.EXTENSION_OPENED).toBe('extension_opened');
      expect(ANALYTICS_EVENTS.SETUP_STARTED).toBe('setup_started');
      expect(ANALYTICS_EVENTS.GITHUB_TOKEN_ADDED).toBe('github_token_added');
      expect(ANALYTICS_EVENTS.SETUP_COMPLETED).toBe('setup_completed');
      expect(ANALYTICS_EVENTS.PROJECT_DETECTED).toBe('project_detected');
      expect(ANALYTICS_EVENTS.DOWNLOAD_INITIATED).toBe('download_initiated');
      expect(ANALYTICS_EVENTS.DOWNLOAD_COMPLETED).toBe('download_completed');
      expect(ANALYTICS_EVENTS.DOWNLOAD_FAILED).toBe('download_failed');
      expect(ANALYTICS_EVENTS.REPO_CREATED).toBe('repo_created');
      expect(ANALYTICS_EVENTS.FILES_UPLOADED).toBe('files_uploaded');
      expect(ANALYTICS_EVENTS.COMMIT_CREATED).toBe('commit_created');
      expect(ANALYTICS_EVENTS.PUSH_COMPLETED).toBe('push_completed');
      expect(ANALYTICS_EVENTS.AUTH_ERROR).toBe('auth_error');
      expect(ANALYTICS_EVENTS.NETWORK_ERROR).toBe('network_error');
      expect(ANALYTICS_EVENTS.PARSING_ERROR).toBe('parsing_error');
      expect(ANALYTICS_EVENTS.UPLOAD_ERROR).toBe('upload_error');
    });
  });

  describe('sendAnalyticsToBackground', () => {
    it('should send message with correct format', () => {
      const eventData = { action: 'click', target: 'button' };

      sendAnalyticsToBackground('test_event', eventData);

      expect(mockChrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: 'ANALYTICS_EVENT',
        eventType: 'test_event',
        eventData,
      });
    });

    it('should handle errors gracefully', () => {
      mockChrome.runtime.sendMessage.mockImplementation(() => {
        throw new Error('Extension context invalidated');
      });

      expect(() => sendAnalyticsToBackground('test_event', {})).not.toThrow();
    });
  });

  describe('trackExtensionLifecycle', () => {
    it('should send analytics for installation', async () => {
      await trackExtensionLifecycle('install', '1.0.0');

      expect(global.fetch).toHaveBeenCalled();
      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);
      expect(payload.events[0].name).toBe('extension_installed');
      expect(payload.events[0].params.event_category).toBe('user_journey');
    });

    it('should send analytics for update', async () => {
      await trackExtensionLifecycle('update', '2.0.0');

      expect(global.fetch).toHaveBeenCalled();
      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const payload = JSON.parse(fetchCall[1].body);
      expect(payload.events[0].name).toBe('extension_updated');
    });
  });

  describe('trackExtensionOpened', () => {
    it('should track popup context', async () => {
      await trackExtensionOpened('popup');

      expect(global.fetch).toHaveBeenCalled();
      const payload = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(payload.events[0].name).toBe('extension_opened');
      expect(JSON.parse(payload.events[0].params.event_label).context).toBe('popup');
    });
  });

  describe('trackOnboardingStep', () => {
    it('should track onboarding started', async () => {
      await trackOnboardingStep('started');

      const payload = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(payload.events[0].name).toBe('setup_started');
    });

    it('should track token added with metadata', async () => {
      await trackOnboardingStep('token_added', { tokenType: 'classic' });

      const payload = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(payload.events[0].name).toBe('github_token_added');
      expect(JSON.parse(payload.events[0].params.event_label)).toEqual({ tokenType: 'classic' });
    });
  });

  describe('trackBoltProjectEvent', () => {
    it('should track project events', async () => {
      await trackBoltProjectEvent('detected', { projectName: 'my-app', fileCount: 10 });

      const payload = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(payload.events[0].name).toBe('project_detected');
      expect(JSON.parse(payload.events[0].params.event_label)).toEqual({
        projectName: 'my-app',
        fileCount: 10,
      });
    });
  });

  describe('trackGitHubRepoOperation', () => {
    it('should track successful operations', async () => {
      await trackGitHubRepoOperation('create', true, { repoName: 'test-repo' });

      const payload = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(payload.events[0].name).toBe('repo_creation_success');
      expect(payload.events[0].params.value).toBe(1);
    });

    it('should track failed operations', async () => {
      await trackGitHubRepoOperation('upload', false, { errorType: 'network_error' });

      const payload = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(payload.events[0].name).toBe('file_upload_failure');
      expect(payload.events[0].params.value).toBe(0);
    });
  });

  describe('trackUserPreference', () => {
    it('should track preference actions', async () => {
      await trackUserPreference('settings_opened');

      const payload = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(payload.events[0].params.event_category).toBe('user_preferences');
    });
  });

  describe('trackFeatureUsage', () => {
    it('should track feature usage', async () => {
      await trackFeatureUsage('file_preview', { fileName: 'App.svelte' });

      const payload = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(payload.events[0].name).toBe('file_preview_opened');
    });
  });

  describe('trackError', () => {
    it('should track errors with Error objects', async () => {
      await trackError('auth', new Error('Invalid token'), 'login');

      expect(global.fetch).toHaveBeenCalledTimes(2);
      const errorPayload = JSON.parse(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
      );
      expect(errorPayload.events[0].name).toBe('extension_error');
      expect(errorPayload.events[0].params.event_label).toContain('auth_login');
    });

    it('should track errors with string messages', async () => {
      await trackError('network', 'Connection timeout', 'fetch');

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('trackPerformance', () => {
    it('should track performance metrics', async () => {
      await trackPerformance('file_upload', 123.456, { fileCount: 10 });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      const timingPayload = JSON.parse(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
      );
      expect(timingPayload.events[0].params.value).toBe(123);
    });
  });

  describe('trackConversionFunnel', () => {
    it('should track conversion stages', async () => {
      await trackConversionFunnel('discovery');
      await trackConversionFunnel('installation', { source: 'chrome_store' });

      expect(global.fetch).toHaveBeenCalledTimes(2);
      const payload1 = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(payload1.events[0].name).toBe('conversion_discovery');
    });
  });

  describe('trackPageView', () => {
    it('should track page views', async () => {
      await trackPageView('popup');

      const payload = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(payload.events[0].name).toBe('page_view');
      expect(payload.events[0].params.page_location).toBe(
        'chrome-extension://test-extension-id/popup'
      );
      expect(payload.events[0].params.page_title).toBe('Bolt to GitHub - Popup');
    });
  });

  describe('trackFeatureAdoption', () => {
    it('should track feature adoption', async () => {
      await trackFeatureAdoption('auto_push', true);

      const payload = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(payload.events[0].name).toBe('auto_push_adopted');
    });
  });

  describe('trackOperationPerformance', () => {
    it('should track operation performance', async () => {
      const startTime = 1704067200000;
      const endTime = startTime + 1000;

      await trackOperationPerformance('upload', startTime, endTime, { fileCount: 5 });

      const payload = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(payload.events[0].params.value).toBe(1000);
    });
  });

  describe('trackUserJourneyMilestone', () => {
    it('should track journey milestones', async () => {
      await trackUserJourneyMilestone('onboarding', 'completed_setup', { step: 1 });

      const payload = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(payload.events[0].name).toBe('onboarding_completed_setup');
    });
  });

  describe('trackOperationResult', () => {
    it('should track operation results', async () => {
      await trackOperationResult('push', true, { duration: 1500 });

      const payload = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(payload.events[0].name).toBe('push_success');
      expect(payload.events[0].params.value).toBe(1);
    });
  });

  describe('trackFeatureUsageWithVersion', () => {
    it('should track feature usage with version', async () => {
      await trackFeatureUsageWithVersion('auto_sync', { version: '1.0.0' });

      const payload = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(payload.events[0].name).toBe('auto_sync_used');
    });
  });

  describe('trackDailyActiveUser', () => {
    it('should track daily active users', async () => {
      await trackDailyActiveUser();

      const payload = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(payload.events[0].name).toBe('daily_active_user');
    });
  });

  describe('withAnalytics wrapper', () => {
    it('should wrap operation and track success', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      const wrapped = withAnalytics(operation, 'test_op');

      const result = await wrapped('arg1', 'arg2');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledWith('arg1', 'arg2');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should track operation with metadata', async () => {
      const operation = vi.fn().mockResolvedValue({ data: 'result' });
      const getMetadata = vi.fn().mockReturnValue({ param: 'value' });
      const wrapped = withAnalytics(operation, 'complex_op', getMetadata);

      await wrapped('input');

      expect(getMetadata).toHaveBeenCalledWith('input');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should track and rethrow errors', async () => {
      const error = new Error('Operation failed');
      const operation = vi.fn().mockRejectedValue(error);
      const wrapped = withAnalytics(operation, 'failing_op');

      await expect(wrapped()).rejects.toThrow('Operation failed');

      expect(global.fetch).toHaveBeenCalledTimes(4);
    });

    it('should preserve return value type', async () => {
      const operation = vi.fn().mockResolvedValue(42);
      const wrapped = withAnalytics(operation, 'typed_op');

      const result = await wrapped();

      expect(result).toBe(42);
      expect(typeof result).toBe('number');
    });
  });

  describe('workflow integration', () => {
    it('should support complete onboarding workflow', async () => {
      await trackOnboardingStep('started');
      await trackExtensionOpened('popup');
      await trackOnboardingStep('token_added', { tokenType: 'fine_grained' });
      await trackOnboardingStep('completed');
      await trackConversionFunnel('first_use');

      expect(global.fetch).toHaveBeenCalledTimes(5);
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(JSON.parse(calls[0][1].body).events[0].name).toBe('setup_started');
      expect(JSON.parse(calls[4][1].body).events[0].name).toBe('conversion_first_use');
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

      expect(global.fetch).toHaveBeenCalledTimes(8);
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(JSON.parse(calls[0][1].body).events[0].name).toBe('project_detected');
      expect(JSON.parse(calls[7][1].body).events[0].name).toBe('conversion_successful_upload');
    });
  });
});
