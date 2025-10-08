/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../AnalyticsService';

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
    });
  });

  describe('Performance Tracking', () => {
    it('should track performance metrics correctly', async () => {
      const startTime = Date.now();
      const endTime = startTime + 1500;
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
      const startTime = 1000;
      const endTime = 3500;

      await analyticsService.trackPerformance('file_upload', startTime, endTime);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events[0].params.value).toBe(2500);
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
      expect(callBody.events[0].params.event_label).toBe(JSON.stringify(metadata));
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
      expect(callBody.events[0].params.event_label).toBe(JSON.stringify(metadata));
    });

    it('should track failed operations', async () => {
      await analyticsService.trackOperationResult('file_upload', false);

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(callBody.events[0].name).toBe('file_upload_failure');
      expect(callBody.events[0].params.value).toBe(0);
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
    });

    it('should handle errors without context', async () => {
      const error = new Error('Unexpected error');

      await analyticsService.trackError(error);

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(callBody.events[0].params.event_label).toContain('unknown: Unexpected error');
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
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        analyticsService.trackFeatureAdoption('test_feature', true)
      ).resolves.not.toThrow();
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
    });

    it('should maintain compatibility with trackPageView', async () => {
      await analyticsService.trackPageView('/popup', 'Extension Popup');

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

      expect(callBody.events[0].name).toBe('page_view');
      expect(callBody.events[0].params.page_location).toContain('/popup');
      expect(callBody.events[0].params.page_title).toBe('Extension Popup');
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
  });
});
