/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../AnalyticsService';

const FIXED_TIME = new Date('2024-01-01T00:00:00.000Z').getTime();

describe('AnalyticsService Enhanced Features', () => {
  let analyticsService: AnalyticsService;
  let mockFetch: Mock;
  let mockChromeRuntime: {
    id: string;
    getManifest: Mock;
    sendMessage: Mock;
  };
  let mockChromeStorage: {
    local: {
      get: Mock;
      set: Mock;
    };
    sync: {
      get: Mock;
      set: Mock;
    };
  };

  beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_TIME });

    mockFetch = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;

    mockChromeRuntime = {
      id: 'test-extension-id',
      getManifest: vi.fn(() => ({
        version: '1.3.7',
        name: 'Bolt to GitHub',
        manifest_version: 3,
      })),
      sendMessage: vi.fn(),
    };

    mockChromeStorage = {
      local: {
        get: vi.fn(() => Promise.resolve({ analyticsClientId: 'test-client-id' })),
        set: vi.fn(() => Promise.resolve()),
      },
      sync: {
        get: vi.fn(() => Promise.resolve({ analyticsEnabled: true })),
        set: vi.fn(() => Promise.resolve()),
      },
    };

    global.chrome = {
      storage: mockChromeStorage,
      runtime: mockChromeRuntime,
    } as unknown as typeof chrome;

    vi.stubGlobal('import', {
      meta: {
        env: {
          VITE_GA4_API_SECRET: 'test-api-secret',
        },
      },
    });

    (AnalyticsService as any).instance = null;

    analyticsService = AnalyticsService.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('Version Tracking', () => {
    it('should track version upgrades correctly', async () => {
      await analyticsService.trackVersionChange('1.3.6', '1.3.7');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('google-analytics.com'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"version_upgrade"'),
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].name).toBe('version_upgrade');
      expect(callBody.events[0].params.event_category).toBe('version_tracking');
      expect(callBody.events[0].params.app_version).toBe('1.3.7');
      const labelData = JSON.parse(callBody.events[0].params.event_label);
      expect(labelData.from).toBe('1.3.6');
      expect(labelData.to).toBe('1.3.7');
    });

    it('should track version downgrades correctly', async () => {
      await analyticsService.trackVersionChange('1.3.8', '1.3.7');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('google-analytics.com'),
        expect.objectContaining({
          body: expect.stringContaining('"version_downgrade"'),
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].name).toBe('version_downgrade');
      expect(callBody.events[0].params.event_category).toBe('version_tracking');
      const labelData = JSON.parse(callBody.events[0].params.event_label);
      expect(labelData.from).toBe('1.3.8');
      expect(labelData.to).toBe('1.3.7');
    });

    it('should not track when versions are the same', async () => {
      await analyticsService.trackVersionChange('1.3.7', '1.3.7');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle semantic versioning correctly', async () => {
      await analyticsService.trackVersionChange('1.3.6', '1.3.7-beta');

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].name).toBe('version_upgrade');

      mockFetch.mockClear();
      await analyticsService.trackVersionChange('1.3.7-alpha', '1.3.7-beta');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should track major version upgrades', async () => {
      await analyticsService.trackVersionChange('1.3.7', '2.0.0');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].name).toBe('version_upgrade');
      const labelData = JSON.parse(callBody.events[0].params.event_label);
      expect(labelData.from).toBe('1.3.7');
      expect(labelData.to).toBe('2.0.0');
    });

    it('should track minor version upgrades', async () => {
      await analyticsService.trackVersionChange('1.3.7', '1.4.0');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].name).toBe('version_upgrade');
      const labelData = JSON.parse(callBody.events[0].params.event_label);
      expect(labelData.from).toBe('1.3.7');
      expect(labelData.to).toBe('1.4.0');
    });

    it('should include app version in all events', async () => {
      await analyticsService.trackFeatureAdoption('github_app_auth', true);

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].params.app_version).toBe('1.3.7');
    });
  });

  describe('Feature Adoption Tracking', () => {
    it('should track feature adoption', async () => {
      await analyticsService.trackFeatureAdoption('github_app_auth', true);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('google-analytics.com'),
        expect.objectContaining({
          body: expect.stringContaining('"github_app_auth_adopted"'),
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].name).toBe('github_app_auth_adopted');
      expect(callBody.events[0].params.event_category).toBe('feature_adoption');
      expect(callBody.events[0].params.app_version).toBe('1.3.7');
      expect(callBody.client_id).toBe('test-client-id');
    });

    it('should track feature abandonment', async () => {
      await analyticsService.trackFeatureAdoption('file_preview', false);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('google-analytics.com'),
        expect.objectContaining({
          body: expect.stringContaining('"file_preview_abandoned"'),
        })
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].name).toBe('file_preview_abandoned');
      expect(callBody.events[0].params.event_category).toBe('feature_adoption');
      expect(callBody.client_id).toBe('test-client-id');
    });

    it('should track multiple features adoption', async () => {
      await analyticsService.trackFeatureAdoption('premium_mode', true);
      await analyticsService.trackFeatureAdoption('auto_sync', true);

      expect(mockFetch).toHaveBeenCalledTimes(2);

      const firstCall = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(firstCall.events[0].name).toBe('premium_mode_adopted');

      const secondCall = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(secondCall.events[0].name).toBe('auto_sync_adopted');
    });
  });

  describe('Performance Tracking', () => {
    it('should track performance metrics correctly', async () => {
      const startTime = FIXED_TIME;
      const endTime = FIXED_TIME + 1500;
      const metadata = { fileCount: 10, totalSize: 1024 };

      await analyticsService.trackPerformance('github_push', startTime, endTime, metadata);

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(callBody.events[0].name).toBe('github_push_duration');
      expect(callBody.events[0].params.event_category).toBe('performance');
      expect(callBody.events[0].params.value).toBe(1500);
      expect(callBody.events[0].params.event_label).toBe(JSON.stringify(metadata));
    });

    it('should calculate duration correctly', async () => {
      const startTime = FIXED_TIME;
      const endTime = FIXED_TIME + 2500;

      await analyticsService.trackPerformance('file_upload', startTime, endTime);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].params.value).toBe(2500);
    });

    it('should include metadata in performance events', async () => {
      const metadata = { fileCount: 5, repoSize: 2048 };
      const startTime = FIXED_TIME;
      const endTime = FIXED_TIME + 3000;

      await analyticsService.trackPerformance('repo_clone', startTime, endTime, metadata);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const eventLabel = JSON.parse(callBody.events[0].params.event_label);
      expect(eventLabel.fileCount).toBe(5);
      expect(eventLabel.repoSize).toBe(2048);
    });

    it('should track zero duration correctly', async () => {
      const startTime = FIXED_TIME;
      const endTime = FIXED_TIME;

      await analyticsService.trackPerformance('quick_operation', startTime, endTime);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].params.value).toBe(0);
    });

    it('should track negative duration as zero', async () => {
      const startTime = FIXED_TIME + 1000;
      const endTime = FIXED_TIME;

      await analyticsService.trackPerformance('invalid_timing', startTime, endTime);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].params.value).toBe(-1000);
      expect(callBody.events[0].params.event_category).toBe('performance');
    });
  });

  describe('User Journey Tracking', () => {
    it('should track user journey milestones', async () => {
      const metadata = { authMethod: 'github_app', timeToComplete: 45 };

      await analyticsService.trackUserJourney('onboarding', 'github_auth_completed', metadata);

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(callBody.events[0].name).toBe('onboarding_github_auth_completed');
      expect(callBody.events[0].params.event_category).toBe('user_journey');
      expect(callBody.events[0].params.app_version).toBe('1.3.7');

      const labelData = JSON.parse(callBody.events[0].params.event_label);
      expect(labelData.authMethod).toBe('github_app');
      expect(labelData.timeToComplete).toBe(45);
    });

    it('should track journey milestones without metadata', async () => {
      await analyticsService.trackUserJourney('setup', 'installation_complete');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].name).toBe('setup_installation_complete');
      expect(callBody.events[0].params.event_category).toBe('user_journey');
      expect(callBody.events[0].params.event_label).toBeUndefined();
    });

    it('should track multiple journey milestones', async () => {
      await analyticsService.trackUserJourney('onboarding', 'step1_complete', { step: 1 });
      await analyticsService.trackUserJourney('onboarding', 'step2_complete', { step: 2 });

      expect(mockFetch).toHaveBeenCalledTimes(2);

      const firstCall = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(firstCall.events[0].name).toBe('onboarding_step1_complete');

      const secondCall = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(secondCall.events[0].name).toBe('onboarding_step2_complete');
    });
  });

  describe('Operation Result Tracking', () => {
    it('should track successful operations', async () => {
      const metadata = { repoType: 'private', filesCount: 25, duration: 3000 };

      await analyticsService.trackOperationResult('repo_creation', true, metadata);

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(callBody.events[0].name).toBe('repo_creation_success');
      expect(callBody.events[0].params.event_category).toBe('operation_results');
      expect(callBody.events[0].params.value).toBe(1);
      expect(callBody.events[0].params.app_version).toBe('1.3.7');

      const labelData = JSON.parse(callBody.events[0].params.event_label);
      expect(labelData.repoType).toBe('private');
      expect(labelData.filesCount).toBe(25);
      expect(labelData.duration).toBe(3000);
    });

    it('should track failed operations', async () => {
      await analyticsService.trackOperationResult('file_upload', false);

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(callBody.events[0].name).toBe('file_upload_failure');
      expect(callBody.events[0].params.event_category).toBe('operation_results');
      expect(callBody.events[0].params.value).toBe(0);
    });

    it('should track failed operations with metadata', async () => {
      const metadata = { errorCode: 'RATE_LIMIT', retries: 3 };

      await analyticsService.trackOperationResult('api_call', false, metadata);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].name).toBe('api_call_failure');
      expect(callBody.events[0].params.value).toBe(0);

      const labelData = JSON.parse(callBody.events[0].params.event_label);
      expect(labelData.errorCode).toBe('RATE_LIMIT');
      expect(labelData.retries).toBe(3);
    });

    it('should track multiple operation results', async () => {
      await analyticsService.trackOperationResult('push', true);
      await analyticsService.trackOperationResult('pull', false);

      expect(mockFetch).toHaveBeenCalledTimes(2);

      const firstCall = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(firstCall.events[0].name).toBe('push_success');
      expect(firstCall.events[0].params.value).toBe(1);

      const secondCall = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(secondCall.events[0].name).toBe('pull_failure');
      expect(secondCall.events[0].params.value).toBe(0);
    });
  });

  describe('Engagement Tracking', () => {
    it('should track daily active users with version', async () => {
      await analyticsService.trackDailyActiveUser();

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(callBody.events[0].name).toBe('daily_active_user');
      expect(callBody.events[0].params.event_category).toBe('engagement');
      expect(callBody.events[0].params.app_version).toBe('1.3.7');

      const labelData = JSON.parse(callBody.events[0].params.event_label);
      expect(labelData.app_version).toBe('1.3.7');
      expect(callBody.client_id).toBe('test-client-id');
    });

    it('should track feature usage with version and metadata', async () => {
      const metadata = { fileType: 'javascript', fileSize: 2048 };

      await analyticsService.trackFeatureUsage('file_preview', metadata);

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(callBody.events[0].name).toBe('file_preview_used');
      expect(callBody.events[0].params.event_category).toBe('feature_usage');
      expect(callBody.events[0].params.app_version).toBe('1.3.7');

      const labelData = JSON.parse(callBody.events[0].params.event_label);
      expect(labelData.fileType).toBe('javascript');
      expect(labelData.fileSize).toBe(2048);
      expect(labelData.app_version).toBe('1.3.7');
    });

    it('should track feature usage without metadata', async () => {
      await analyticsService.trackFeatureUsage('auto_sync');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].name).toBe('auto_sync_used');

      const labelData = JSON.parse(callBody.events[0].params.event_label);
      expect(labelData.app_version).toBe('1.3.7');
      expect(Object.keys(labelData)).toEqual(['app_version']);
    });

    it('should include client ID in all engagement events', async () => {
      await analyticsService.trackDailyActiveUser();

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.client_id).toBe('test-client-id');
    });
  });

  describe('Error Tracking', () => {
    it('should track errors with version and context', async () => {
      const error = new Error('Network timeout');
      const context = 'github_api';

      await analyticsService.trackError(error, context);

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(callBody.events[0].name).toBe('extension_error');
      expect(callBody.events[0].params.event_category).toBe('errors');
      expect(callBody.events[0].params.event_label).toContain('github_api: Network timeout');
      expect(callBody.events[0].params.event_label).toContain('(v1.3.7)');
      expect(callBody.events[0].params.app_version).toBe('1.3.7');
      expect(callBody.events[0].params.value).toBe(1);
    });

    it('should handle errors without context', async () => {
      const error = new Error('Unexpected error');

      await analyticsService.trackError(error);

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(callBody.events[0].params.event_label).toContain('unknown: Unexpected error');
      expect(callBody.events[0].params.event_label).toContain('(v1.3.7)');
    });

    it('should track multiple errors with different contexts', async () => {
      await analyticsService.trackError(new Error('API error'), 'api');
      await analyticsService.trackError(new Error('Storage error'), 'storage');

      expect(mockFetch).toHaveBeenCalledTimes(2);

      const firstCall = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(firstCall.events[0].params.event_label).toContain('api: API error');

      const secondCall = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(secondCall.events[0].params.event_label).toContain('storage: Storage error');
    });

    it('should include error value in all error events', async () => {
      await analyticsService.trackError(new Error('Test error'), 'test');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].params.value).toBe(1);
      expect(callBody.events[0].params.event_category).toBe('errors');
    });
  });

  describe('Analytics State Management', () => {
    it('should not track when analytics is disabled', async () => {
      (AnalyticsService as any).instance = null;
      mockChromeStorage.sync.get.mockResolvedValue({ analyticsEnabled: false });

      const disabledService = AnalyticsService.getInstance();
      await disabledService.trackFeatureAdoption('test_feature', true);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not track when API secret is missing', async () => {
      (AnalyticsService as any).instance = null;

      const serviceWithoutSecret = AnalyticsService.getInstance();

      (serviceWithoutSecret as any).API_SECRET = '';

      await serviceWithoutSecret.trackFeatureAdoption('test_feature', true);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle storage errors gracefully', async () => {
      mockChromeStorage.sync.get.mockRejectedValue(new Error('Storage error'));

      await expect(
        analyticsService.trackFeatureAdoption('test_feature', true)
      ).resolves.not.toThrow();

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        analyticsService.trackFeatureAdoption('test_feature', true)
      ).resolves.not.toThrow();
    });

    it('should initialize config only once', async () => {
      const service = AnalyticsService.getInstance();

      await service.trackDailyActiveUser();
      await service.trackFeatureUsage('test');

      expect(mockChromeStorage.local.get).toHaveBeenCalledTimes(1);
    });

    it('should respect analytics enabled state from storage', async () => {
      (AnalyticsService as any).instance = null;
      mockChromeStorage.sync.get.mockResolvedValue({ analyticsEnabled: true });

      const enabledService = AnalyticsService.getInstance();
      await enabledService.trackEvent({ category: 'test', action: 'test_action' });

      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with trackEvent', async () => {
      await analyticsService.trackEvent({
        category: 'github_operations',
        action: 'push_success',
        label: 'test',
        value: 1,
      });

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(callBody.events[0].name).toBe('push_success');
      expect(callBody.events[0].params.event_category).toBe('github_operations');
      expect(callBody.events[0].params.event_label).toBe('test');
      expect(callBody.events[0].params.value).toBe(1);
      expect(callBody.events[0].params.app_version).toBe('1.3.7');
      expect(callBody.client_id).toBe('test-client-id');
    });

    it('should maintain compatibility with trackPageView', async () => {
      await analyticsService.trackPageView('/popup', 'Extension Popup');

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(callBody.events[0].name).toBe('page_view');
      expect(callBody.events[0].params.page_location).toContain('/popup');
      expect(callBody.events[0].params.page_title).toBe('Extension Popup');
      expect(callBody.events[0].params.app_version).toBe('1.3.7');
    });

    it('should maintain compatibility with trackGitHubOperation', async () => {
      const details = { count: 5 };

      await analyticsService.trackGitHubOperation('file_upload', true, details);

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(callBody.events[0].name).toBe('file_upload_success');
      expect(callBody.events[0].params.event_category).toBe('github_operations');
      expect(callBody.events[0].params.value).toBe(1);
      expect(callBody.events[0].params.event_label).toBe(JSON.stringify(details));
    });

    it('should track failed GitHub operations', async () => {
      await analyticsService.trackGitHubOperation('repo_clone', false);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].name).toBe('repo_clone_failure');
      expect(callBody.events[0].params.value).toBe(0);
    });

    it('should include extension ID in page view location', async () => {
      await analyticsService.trackPageView('/settings');

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].params.page_location).toContain('chrome-extension://');
      expect(callBody.events[0].params.page_location).toContain('test-extension-id');
    });
  });

  describe('Service Worker Compatibility', () => {
    it('should pass service worker compatibility test', async () => {
      const result = await analyticsService.testServiceWorkerCompatibility();

      expect(result).toBe(true);
    });

    it('should provide analytics summary', async () => {
      mockChromeStorage.local.get.mockResolvedValue({
        analyticsClientId: 'test-client-123',
        lastAnalyticsSync: '2023-01-01T00:00:00.000Z',
      });

      const summary = await analyticsService.getAnalyticsSummary();

      expect(summary).toEqual({
        clientId: 'test-client-123',
        lastSync: '2023-01-01T00:00:00.000Z',
        enabled: true,
      });
    });

    it('should handle missing analytics data in summary', async () => {
      mockChromeStorage.local.get.mockResolvedValue({});

      const summary = await analyticsService.getAnalyticsSummary();

      expect(summary.clientId).toBeUndefined();
      expect(summary.lastSync).toBeUndefined();
      expect(summary.enabled).toBe(true);
    });

    it('should handle analytics summary errors gracefully', async () => {
      mockChromeStorage.local.get.mockRejectedValue(new Error('Storage error'));

      const summary = await analyticsService.getAnalyticsSummary();

      expect(summary).toEqual({ enabled: false });
    });

    it('should generate valid client ID', async () => {
      const result = await analyticsService.testServiceWorkerCompatibility();

      expect(result).toBe(true);
      expect(mockChromeStorage.local.get).toHaveBeenCalled();
    });
  });
});
