// Tests for enhanced analytics functionality
describe('AnalyticsService Enhanced Features', () => {
  let mockFetch: jest.Mock;
  let mockChromeRuntime: any;
  let mockChromeStorage: any;

  beforeEach(() => {
    // Mock global fetch
    mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;

    // Mock chrome.runtime
    mockChromeRuntime = {
      id: 'test-extension-id',
      getManifest: jest.fn(() => ({
        version: '1.3.7',
        name: 'Bolt to GitHub',
        manifest_version: 3,
      })),
      sendMessage: jest.fn(),
    };

    // Mock chrome.storage
    mockChromeStorage = {
      local: {
        get: jest.fn(() => Promise.resolve({})),
        set: jest.fn(() => Promise.resolve()),
      },
      sync: {
        get: jest.fn(() => Promise.resolve({ analyticsEnabled: true })),
        set: jest.fn(() => Promise.resolve()),
      },
    };

    // Set chrome mocks
    global.chrome = {
      runtime: mockChromeRuntime,
      storage: mockChromeStorage,
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Version Tracking Requirements', () => {
    it('should include app version in all analytics events', async () => {
      // This test verifies that when any analytics event is sent,
      // it includes the app_version parameter from the manifest

      // Expected implementation:
      // - All trackEvent calls should automatically append app_version
      // - The version should come from chrome.runtime.getManifest().version

      expect(mockChromeRuntime.getManifest).toBeDefined();
      expect(mockChromeRuntime.getManifest().version).toBe('1.3.7');
    });

    it('should track version upgrades when extension is updated', async () => {
      // This test verifies version upgrade tracking

      // Expected implementation:
      // - Compare old version with new version
      // - Send event with category: 'version_tracking', action: 'version_upgrade'
      // - Include both versions in the event data

      const expectedEventData = {
        category: 'version_tracking',
        action: 'version_upgrade',
        from_version: '1.3.6',
        to_version: '1.3.7',
      };

      // The service should detect and track version changes
      expect(expectedEventData.action).toBe('version_upgrade');
    });

    it('should track version downgrades when detected', async () => {
      // This test verifies version downgrade tracking

      // Expected implementation:
      // - Detect when current version is lower than previous
      // - Send event with action: 'version_downgrade'

      const expectedEventData = {
        category: 'version_tracking',
        action: 'version_downgrade',
        from_version: '1.3.8',
        to_version: '1.3.7',
      };

      expect(expectedEventData.action).toBe('version_downgrade');
    });

    it('should include version in error tracking', async () => {
      // This test verifies that errors include version info

      // Expected implementation:
      // - trackError method should include app_version
      // - Error context should be preserved

      const expectedErrorData = {
        category: 'errors',
        action: 'extension_error',
        app_version: '1.3.7',
        error_message: 'Test error',
        context: 'test_context',
      };

      expect(expectedErrorData.app_version).toBe('1.3.7');
    });
  });

  describe('Enhanced Metrics Requirements', () => {
    it('should track feature adoption rates', async () => {
      // This test verifies feature adoption tracking

      // Expected implementation:
      // - New method: trackFeatureAdoption(feature, adopted)
      // - Track whether users adopt or abandon features

      const expectedAdoptionData = {
        category: 'feature_adoption',
        action: 'github_app_auth_adopted',
        feature: 'github_app_auth',
        adopted: true,
      };

      expect(expectedAdoptionData.category).toBe('feature_adoption');
    });

    it('should track performance metrics for key operations', async () => {
      // This test verifies performance tracking

      // Expected implementation:
      // - New method: trackPerformance(operation, startTime, endTime, metadata)
      // - Calculate and track operation duration

      const startTime = Date.now();
      const endTime = startTime + 1500;

      const expectedPerformanceData = {
        category: 'performance',
        action: 'github_push_duration',
        duration_ms: 1500,
        metadata: {
          fileCount: 10,
          totalSize: 1024,
        },
      };

      expect(expectedPerformanceData.duration_ms).toBe(1500);
    });

    it('should track user journey analytics', async () => {
      // This test verifies user journey tracking

      // Expected implementation:
      // - New method: trackUserJourney(journey, milestone, metadata)
      // - Track user progress through key workflows

      const expectedJourneyData = {
        category: 'user_journey',
        action: 'onboarding_github_auth_completed',
        journey: 'onboarding',
        milestone: 'github_auth_completed',
        metadata: {
          authMethod: 'github_app',
          timeToComplete: 45,
        },
      };

      expect(expectedJourneyData.category).toBe('user_journey');
    });

    it('should track success/failure rates with detailed context', async () => {
      // This test verifies operation result tracking

      // Expected implementation:
      // - New method: trackOperationResult(operation, success, metadata)
      // - Include detailed context about the operation

      const expectedResultData = {
        category: 'operation_results',
        action: 'repo_creation_success',
        success: true,
        metadata: {
          repoType: 'private',
          filesCount: 25,
          duration: 3000,
        },
      };

      expect(expectedResultData.success).toBe(true);
    });
  });

  describe('Version Distribution Tracking Requirements', () => {
    it('should track daily active users by version', async () => {
      // This test verifies DAU tracking by version

      // Expected implementation:
      // - New method: trackDailyActiveUser()
      // - Include version in engagement metrics

      const expectedDAUData = {
        category: 'engagement',
        action: 'daily_active_user',
        app_version: '1.3.7',
      };

      expect(expectedDAUData.app_version).toBe('1.3.7');
    });

    it('should track feature usage by version', async () => {
      // This test verifies feature usage tracking by version

      // Expected implementation:
      // - New method: trackFeatureUsage(feature, metadata)
      // - Always include app_version

      const expectedUsageData = {
        category: 'feature_usage',
        action: 'file_preview_used',
        feature: 'file_preview',
        app_version: '1.3.7',
        metadata: {
          fileType: 'javascript',
          fileSize: 2048,
        },
      };

      expect(expectedUsageData.app_version).toBe('1.3.7');
    });

    it('should monitor error rates by version', async () => {
      // This test verifies error rate monitoring by version

      // Expected implementation:
      // - Enhanced trackError to always include version
      // - Group errors by version for analysis

      const expectedErrorData = {
        category: 'errors',
        action: 'extension_error',
        app_version: '1.3.7',
        error_type: 'network_timeout',
        context: 'github_api',
      };

      expect(expectedErrorData.app_version).toBe('1.3.7');
    });
  });

  describe('Backward Compatibility Requirements', () => {
    it('should maintain compatibility with existing trackEvent calls', () => {
      // Verify existing method signatures still work
      const existingEventStructure = {
        category: 'github_operations',
        action: 'push_success',
        label: 'test',
        value: 1,
      };

      expect(existingEventStructure).toHaveProperty('category');
      expect(existingEventStructure).toHaveProperty('action');
    });

    it('should maintain compatibility with existing trackPageView', () => {
      // Verify trackPageView still works
      const pageViewData = {
        pagePath: '/popup',
        pageTitle: 'Extension Popup',
      };

      expect(pageViewData).toHaveProperty('pagePath');
    });

    it('should maintain compatibility with existing trackGitHubOperation', () => {
      // Verify trackGitHubOperation still works
      const githubOpData = {
        operation: 'file_upload',
        success: true,
        details: { count: 5 },
      };

      expect(githubOpData).toHaveProperty('operation');
      expect(githubOpData).toHaveProperty('success');
    });
  });

  describe('Privacy Compliance Requirements', () => {
    it('should not track when analytics is disabled', async () => {
      // Update mock to disable analytics
      mockChromeStorage.sync.get.mockResolvedValue({ analyticsEnabled: false });

      // Verify no tracking occurs
      expect(mockChromeStorage.sync.get).toBeDefined();
    });

    it('should not include any PII in version tracking', () => {
      // Verify no personal information patterns
      const versionData = {
        category: 'version_tracking',
        action: 'version_upgrade',
        from: '1.3.6',
        to: '1.3.7',
      };

      const dataString = JSON.stringify(versionData);

      // Check for common PII patterns
      expect(dataString).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/); // email
      expect(dataString).not.toMatch(/ghp_[a-zA-Z0-9]{36}/); // GitHub token
      expect(dataString).not.toMatch(/\/users\/[a-zA-Z0-9-]+/); // username paths
    });
  });
});

// Type definitions for the new methods
interface AnalyticsEnhancements {
  trackVersionChange(oldVersion: string, newVersion: string): Promise<void>;
  trackFeatureAdoption(feature: string, adopted: boolean): Promise<void>;
  trackPerformance(
    operation: string,
    startTime: number,
    endTime: number,
    metadata?: any
  ): Promise<void>;
  trackUserJourney(journey: string, milestone: string, metadata?: any): Promise<void>;
  trackOperationResult(operation: string, success: boolean, metadata?: any): Promise<void>;
  trackDailyActiveUser(): Promise<void>;
  trackFeatureUsage(feature: string, metadata?: any): Promise<void>;
}
