import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../AnalyticsService';

const FIXED_TIME = new Date('2024-01-01T00:00:00.000Z');
const FIXED_TIMESTAMP = FIXED_TIME.getTime();

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

const mockFetch = vi.fn<[RequestInfo | URL, RequestInit?], Promise<Response>>(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  } as Response)
);
global.fetch = mockFetch as typeof fetch;

interface AnalyticsPayload {
  client_id: string;
  events: Array<{
    name: string;
    params: {
      event_category?: string;
      event_label?: string;
      value?: number;
      app_version?: string;
      custom_parameter_action?: string;
      [key: string]: string | number | boolean | undefined;
    };
  }>;
}

describe('AnalyticsService Version Tracking', () => {
  let analyticsService: AnalyticsService;

  beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_TIME });
    vi.clearAllMocks();

    analyticsService = AnalyticsService.getInstance();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('trackVersionChange - Version Upgrade Tracking', () => {
    it('should send correct HTTP request for version upgrade', async () => {
      await analyticsService.trackVersionChange('1.3.6', '1.3.7');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toContain('https://www.google-analytics.com/mp/collect');
      expect(url).toContain('measurement_id=G-6J0TXX2XW0');
      expect(options?.method).toBe('POST');
      expect(options?.headers).toEqual({ 'Content-Type': 'application/json' });
    });

    it('should include correct event data for version upgrade', async () => {
      await analyticsService.trackVersionChange('1.3.6', '1.3.7');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);

      expect(payload.client_id).toBe('test-client-id');
      expect(payload.events).toHaveLength(1);

      const event = payload.events[0];
      expect(event.name).toBe('version_upgrade');
      expect(event.params.event_category).toBe('version_tracking');
      expect(event.params.app_version).toBe('1.3.7');

      const versionData = JSON.parse(event.params.event_label as string);
      expect(versionData).toEqual({ from: '1.3.6', to: '1.3.7' });
    });

    it('should track major version upgrades', async () => {
      await analyticsService.trackVersionChange('1.9.9', '2.0.0');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_upgrade');
      const versionData = JSON.parse(event.params.event_label as string);
      expect(versionData.from).toBe('1.9.9');
      expect(versionData.to).toBe('2.0.0');
    });

    it('should track minor version upgrades', async () => {
      await analyticsService.trackVersionChange('1.3.5', '1.4.0');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_upgrade');
      const versionData = JSON.parse(event.params.event_label as string);
      expect(versionData.from).toBe('1.3.5');
      expect(versionData.to).toBe('1.4.0');
    });

    it('should track patch version upgrades', async () => {
      await analyticsService.trackVersionChange('1.3.6', '1.3.7');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_upgrade');
      const versionData = JSON.parse(event.params.event_label as string);
      expect(versionData.from).toBe('1.3.6');
      expect(versionData.to).toBe('1.3.7');
    });
  });

  describe('trackVersionChange - Version Downgrade Tracking', () => {
    it('should send correct event data for version downgrade', async () => {
      await analyticsService.trackVersionChange('1.3.8', '1.3.7');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_downgrade');
      expect(event.params.event_category).toBe('version_tracking');
      expect(event.params.app_version).toBe('1.3.7');

      const versionData = JSON.parse(event.params.event_label as string);
      expect(versionData).toEqual({ from: '1.3.8', to: '1.3.7' });
    });

    it('should track major version downgrades', async () => {
      await analyticsService.trackVersionChange('2.0.0', '1.9.9');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_downgrade');
      const versionData = JSON.parse(event.params.event_label as string);
      expect(versionData.from).toBe('2.0.0');
      expect(versionData.to).toBe('1.9.9');
    });

    it('should track minor version downgrades', async () => {
      await analyticsService.trackVersionChange('1.4.0', '1.3.9');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_downgrade');
      const versionData = JSON.parse(event.params.event_label as string);
      expect(versionData.from).toBe('1.4.0');
      expect(versionData.to).toBe('1.3.9');
    });
  });

  describe('trackVersionChange - Same Version Handling', () => {
    it('should not send analytics when versions are identical', async () => {
      await analyticsService.trackVersionChange('1.3.7', '1.3.7');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not send analytics for multiple same-version calls', async () => {
      await analyticsService.trackVersionChange('2.0.0', '2.0.0');
      await analyticsService.trackVersionChange('1.5.3', '1.5.3');

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('trackVersionChange - Pre-release Version Handling', () => {
    it('should track upgrades from stable to pre-release (beta)', async () => {
      await analyticsService.trackVersionChange('1.3.6', '1.3.7-beta');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_upgrade');
      const versionData = JSON.parse(event.params.event_label as string);
      expect(versionData.from).toBe('1.3.6');
      expect(versionData.to).toBe('1.3.7-beta');
    });

    it('should track upgrades from stable to pre-release (alpha)', async () => {
      await analyticsService.trackVersionChange('1.3.6', '1.3.7-alpha');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_upgrade');
      const versionData = JSON.parse(event.params.event_label as string);
      expect(versionData.to).toBe('1.3.7-alpha');
    });

    it('should track upgrades from pre-release to stable', async () => {
      await analyticsService.trackVersionChange('1.3.6-beta', '1.3.7');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_upgrade');
      const versionData = JSON.parse(event.params.event_label as string);
      expect(versionData.from).toBe('1.3.6-beta');
      expect(versionData.to).toBe('1.3.7');
    });

    it('should track upgrades between pre-release versions of different core versions', async () => {
      await analyticsService.trackVersionChange('1.3.6-beta', '1.3.7-alpha');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_upgrade');
    });

    it('should not track changes between pre-release versions of same core version', async () => {
      const testCases = [
        { from: '1.3.7-alpha', to: '1.3.7-beta' },
        { from: '1.3.7-rc.1', to: '1.3.7' },
        { from: '1.3.7', to: '1.3.7-beta' },
        { from: '1.3.7-beta', to: '1.3.7-alpha' },
      ];

      for (const { from, to } of testCases) {
        mockFetch.mockClear();
        await analyticsService.trackVersionChange(from, to);
        expect(mockFetch).not.toHaveBeenCalled();
      }
    });

    it('should track downgrades from pre-release to older stable', async () => {
      await analyticsService.trackVersionChange('1.3.8-beta', '1.3.7');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_downgrade');
      const versionData = JSON.parse(event.params.event_label as string);
      expect(versionData.from).toBe('1.3.8-beta');
      expect(versionData.to).toBe('1.3.7');
    });

    it('should track downgrades from stable to older pre-release', async () => {
      await analyticsService.trackVersionChange('1.3.8', '1.3.7-beta');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_downgrade');
    });

    it('should track downgrades between pre-release versions', async () => {
      await analyticsService.trackVersionChange('1.3.8-alpha', '1.3.7-rc.1');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_downgrade');
    });
  });

  describe('trackVersionChange - Complex Version Format Handling', () => {
    it('should not track between beta versions with build numbers', async () => {
      mockFetch.mockClear();
      await analyticsService.trackVersionChange('1.3.7-beta.1', '1.3.7-beta.2');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not track between rc versions with build metadata', async () => {
      mockFetch.mockClear();
      await analyticsService.trackVersionChange('1.3.7-rc1+build123', '1.3.7-rc2+build456');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should track downgrade from major pre-release to older stable', async () => {
      await analyticsService.trackVersionChange('2.0.0-alpha', '1.9.9');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_downgrade');
      const versionData = JSON.parse(event.params.event_label as string);
      expect(versionData.from).toBe('2.0.0-alpha');
      expect(versionData.to).toBe('1.9.9');
    });

    it('should track upgrade from older stable to major pre-release', async () => {
      await analyticsService.trackVersionChange('1.9.9', '2.0.0-alpha');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      const event = payload.events[0];

      expect(event.name).toBe('version_upgrade');
      const versionData = JSON.parse(event.params.event_label as string);
      expect(versionData.from).toBe('1.9.9');
      expect(versionData.to).toBe('2.0.0-alpha');
    });
  });

  describe('trackVersionChange - Invalid Input Handling', () => {
    it('should not send analytics when old version is empty string', async () => {
      await analyticsService.trackVersionChange('', '1.3.7');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not send analytics when new version is empty string', async () => {
      await analyticsService.trackVersionChange('1.3.7', '');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not send analytics when old version is null', async () => {
      await analyticsService.trackVersionChange(null as never, '1.3.7');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not send analytics when new version is undefined', async () => {
      await analyticsService.trackVersionChange('1.3.7', undefined as never);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not send analytics when both versions are invalid', async () => {
      await analyticsService.trackVersionChange('', '');
      await analyticsService.trackVersionChange(null as never, undefined as never);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Version Tracking - App Version Inclusion in Events', () => {
    it('should include app_version in trackEvent', async () => {
      await analyticsService.trackEvent({ category: 'test', action: 'test_action' });

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(payload.events[0].params.app_version).toBe('1.3.7');
    });

    it('should include app_version in trackPageView', async () => {
      await analyticsService.trackPageView('/test');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(payload.events[0].params.app_version).toBe('1.3.7');
    });

    it('should include app_version in trackExtensionEvent', async () => {
      await analyticsService.trackExtensionEvent('test_event');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(payload.events[0].params.app_version).toBe('1.3.7');
    });

    it('should include app_version in trackGitHubOperation', async () => {
      await analyticsService.trackGitHubOperation('test_op', true);

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(payload.events[0].params.app_version).toBe('1.3.7');
    });

    it('should include app_version in trackMilestone', async () => {
      await analyticsService.trackMilestone('test_milestone');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(payload.events[0].params.app_version).toBe('1.3.7');
    });

    it('should include app_version in trackError', async () => {
      await analyticsService.trackError(new Error('test'), 'test_context');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(payload.events[0].params.app_version).toBe('1.3.7');
    });

    it('should include app_version in trackFeatureAdoption', async () => {
      await analyticsService.trackFeatureAdoption('test_feature', true);

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(payload.events[0].params.app_version).toBe('1.3.7');
    });

    it('should include app_version in trackPerformance', async () => {
      await analyticsService.trackPerformance('test_op', FIXED_TIMESTAMP, FIXED_TIMESTAMP + 100);

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(payload.events[0].params.app_version).toBe('1.3.7');
    });

    it('should include app_version in trackUserJourney', async () => {
      await analyticsService.trackUserJourney('test_journey', 'test_milestone');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(payload.events[0].params.app_version).toBe('1.3.7');
    });

    it('should include app_version in trackOperationResult', async () => {
      await analyticsService.trackOperationResult('test_op', true);

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(payload.events[0].params.app_version).toBe('1.3.7');
    });

    it('should include app_version in trackDailyActiveUser', async () => {
      await analyticsService.trackDailyActiveUser();

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(payload.events[0].params.app_version).toBe('1.3.7');
    });

    it('should include app_version in trackFeatureUsage', async () => {
      await analyticsService.trackFeatureUsage('test_feature');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(payload.events[0].params.app_version).toBe('1.3.7');
    });

    it('should include app_version in version tracking events', async () => {
      await analyticsService.trackVersionChange('1.3.6', '1.3.7');

      const payload: AnalyticsPayload = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
      expect(payload.events[0].params.app_version).toBe('1.3.7');
    });
  });
});
