import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../AnalyticsService';

// Mock chrome APIs
const mockChromeRuntime = {
  id: 'test-extension-id',
  getManifest: vi.fn(() => ({
    version: '1.3.7',
    name: 'Bolt to GitHub',
    manifest_version: 3,
  })),
  sendMessage: vi.fn(),
};

const mockChromeStorage = {
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

// Mock fetch
const mockFetch = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  } as Response)
);
global.fetch = mockFetch as typeof fetch;

describe('AnalyticsService Version Tracking', () => {
  let analyticsService: AnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton instance
    analyticsService = AnalyticsService.getInstance();
  });

  describe('trackVersionChange', () => {
    it('should track version upgrades correctly', async () => {
      await analyticsService.trackVersionChange('1.3.6', '1.3.7');

      expect(mockFetch).toHaveBeenCalled();
      const call = mockFetch.mock.calls[0];
      if (!call || !call[1]) throw new Error('Expected fetch to be called with options');
      const payload = JSON.parse(call[1].body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_upgrade');
      expect(event.params.event_category).toBe('version_tracking');
      expect(event.params.event_label).toContain('"from":"1.3.6"');
      expect(event.params.event_label).toContain('"to":"1.3.7"');
    });

    it('should track version downgrades correctly', async () => {
      await analyticsService.trackVersionChange('1.3.8', '1.3.7');

      expect(mockFetch).toHaveBeenCalled();
      const call = mockFetch.mock.calls[0];
      if (!call || !call[1]) throw new Error('Expected fetch to be called with options');
      const payload = JSON.parse(call[1].body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_downgrade');
    });

    it('should not track when versions are equal', async () => {
      await analyticsService.trackVersionChange('1.3.7', '1.3.7');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle semantic versioning with pre-release identifiers', async () => {
      const testCases = [
        // Upgrades
        { from: '1.3.6', to: '1.3.7-beta', expectedEvent: 'version_upgrade' },
        { from: '1.3.6', to: '1.3.7-alpha', expectedEvent: 'version_upgrade' },
        { from: '1.3.6-beta', to: '1.3.7', expectedEvent: 'version_upgrade' },
        { from: '1.3.6-beta', to: '1.3.7-alpha', expectedEvent: 'version_upgrade' },

        // Same base version - no event
        { from: '1.3.7-alpha', to: '1.3.7-beta', expectedEvent: null },
        { from: '1.3.7-rc.1', to: '1.3.7', expectedEvent: null },
        { from: '1.3.7', to: '1.3.7-beta', expectedEvent: null },
        { from: '1.3.7-beta', to: '1.3.7-alpha', expectedEvent: null },

        // Downgrades
        { from: '1.3.8-beta', to: '1.3.7', expectedEvent: 'version_downgrade' },
        { from: '1.3.8', to: '1.3.7-beta', expectedEvent: 'version_downgrade' },
        { from: '1.3.8-alpha', to: '1.3.7-rc.1', expectedEvent: 'version_downgrade' },
      ];

      for (const { from, to, expectedEvent } of testCases) {
        mockFetch.mockClear();
        await analyticsService.trackVersionChange(from, to);

        if (expectedEvent === null) {
          expect(mockFetch).not.toHaveBeenCalled();
        } else {
          expect(mockFetch).toHaveBeenCalled();
          const call = mockFetch.mock.calls[0];
          if (!call || !call[1]) throw new Error('Expected fetch to be called with options');
          const payload = JSON.parse(call[1].body as string);
          const event = payload.events[0];
          expect(event.name).toBe(expectedEvent);
        }
      }
    });

    it('should handle invalid version inputs gracefully', async () => {
      // Test with various invalid inputs
      await analyticsService.trackVersionChange('', '1.3.7');
      expect(mockFetch).not.toHaveBeenCalled();

      await analyticsService.trackVersionChange('1.3.7', '');
      expect(mockFetch).not.toHaveBeenCalled();

      await analyticsService.trackVersionChange(null as unknown as string, '1.3.7');
      expect(mockFetch).not.toHaveBeenCalled();

      await analyticsService.trackVersionChange('1.3.7', undefined as unknown as string);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle complex version formats', async () => {
      const testCases = [
        { from: '1.3.7-beta.1', to: '1.3.7-beta.2', expectedEvent: null }, // Same base
        { from: '1.3.7-rc1+build123', to: '1.3.7-rc2+build456', expectedEvent: null }, // Same base
        { from: '2.0.0-alpha', to: '1.9.9', expectedEvent: 'version_downgrade' }, // 2.0.0 > 1.9.9, so downgrade
        { from: '1.9.9', to: '2.0.0-alpha', expectedEvent: 'version_upgrade' }, // 1.9.9 < 2.0.0, so upgrade
      ];

      for (const { from, to, expectedEvent } of testCases) {
        mockFetch.mockClear();
        await analyticsService.trackVersionChange(from, to);

        if (expectedEvent === null) {
          expect(mockFetch).not.toHaveBeenCalled();
        } else {
          expect(mockFetch).toHaveBeenCalled();
          const call = mockFetch.mock.calls[0];
          if (!call || !call[1]) throw new Error('Expected fetch to be called with options');
          const payload = JSON.parse(call[1].body as string);
          const event = payload.events[0];
          expect(event.name).toBe(expectedEvent);
        }
      }
    });
  });

  describe('version inclusion in all events', () => {
    it('should include app_version in all analytics events', async () => {
      const eventMethods = [
        () => analyticsService.trackEvent({ category: 'test', action: 'test_action' }),
        () => analyticsService.trackPageView('/test'),
        () => analyticsService.trackExtensionEvent('test_event'),
        () => analyticsService.trackGitHubOperation('test_op', true),
        () => analyticsService.trackMilestone('test_milestone'),
        () => analyticsService.trackError(new Error('test'), 'test_context'),
        () => analyticsService.trackFeatureAdoption('test_feature', true),
        () => analyticsService.trackPerformance('test_op', 100, 200),
        () => analyticsService.trackUserJourney('test_journey', 'test_milestone'),
        () => analyticsService.trackOperationResult('test_op', true),
        () => analyticsService.trackDailyActiveUser(),
        () => analyticsService.trackFeatureUsage('test_feature'),
      ];

      for (const trackMethod of eventMethods) {
        mockFetch.mockClear();
        await trackMethod();

        expect(mockFetch).toHaveBeenCalled();
        const call = mockFetch.mock.calls[0];
        if (!call || !call[1]) throw new Error('Expected fetch to be called with options');
        const payload = JSON.parse(call[1].body as string);
        const event = payload.events[0];

        // Every event should include app_version
        expect(event.params.app_version).toBe('1.3.7');
      }
    });
  });
});
