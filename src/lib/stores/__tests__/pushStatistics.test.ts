/* eslint-disable @typescript-eslint/no-explicit-any */
import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';
import { ChromeStorageService } from '../../services/chromeStorage';
import { pushStatisticsActions, pushStatisticsStore } from '../pushStatistics';

// Mock ChromeStorageService
vi.mock('../../services/chromeStorage', () => ({
  ChromeStorageService: {
    getPushStatistics: vi.fn(),
    savePushStatistics: vi.fn(),
    clearPushStatistics: vi.fn(),
  },
}));

// Mock chrome storage
global.chrome = {
  storage: {
    onChanged: {
      addListener: vi.fn(),
    },
  },
} as any;

describe('Push Statistics Store', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Reset store to initial state
    pushStatisticsStore.set({
      statistics: {
        totalAttempts: 0,
        totalSuccesses: 0,
        totalFailures: 0,
        records: [],
      },
      isLoading: false,
    });
  });

  it('should initialize with empty statistics', () => {
    const state = get(pushStatisticsStore);
    expect(state.statistics.totalAttempts).toBe(0);
    expect(state.statistics.totalSuccesses).toBe(0);
    expect(state.statistics.totalFailures).toBe(0);
    expect(state.statistics.records).toEqual([]);
    expect(state.isLoading).toBe(false);
  });

  it('should load statistics from storage', async () => {
    const mockStatistics = {
      totalAttempts: 5,
      totalSuccesses: 3,
      totalFailures: 2,
      records: [],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(
      mockStatistics
    );

    await pushStatisticsActions.loadPushStatistics();

    const state = get(pushStatisticsStore);
    expect(state.statistics).toEqual(mockStatistics);
    expect(state.isLoading).toBe(false);
  });

  it('should record push attempt', async () => {
    const initialStats = {
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      records: [],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(initialStats);
    (ChromeStorageService.savePushStatistics as MockedFunction<any>).mockResolvedValue(undefined);

    await pushStatisticsActions.recordPushAttempt(
      'test-project',
      'test-owner',
      'test-repo',
      'main',
      10,
      'Test commit'
    );

    expect(ChromeStorageService.savePushStatistics).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAttempts: 1,
        records: expect.arrayContaining([
          expect.objectContaining({
            projectId: 'test-project',
            repoOwner: 'test-owner',
            repoName: 'test-repo',
            branch: 'main',
            filesCount: 10,
            commitMessage: 'Test commit',
            success: false,
          }),
        ]),
      })
    );
  });

  it('should record push success', async () => {
    const existingRecord = {
      timestamp: Date.now(),
      success: false,
      projectId: 'test-project',
      repoOwner: 'test-owner',
      repoName: 'test-repo',
      branch: 'main',
      filesCount: 10,
      commitMessage: 'Test commit',
    };

    const initialStats = {
      totalAttempts: 1,
      totalSuccesses: 0,
      totalFailures: 0,
      records: [existingRecord],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(initialStats);
    (ChromeStorageService.savePushStatistics as MockedFunction<any>).mockResolvedValue(undefined);

    await pushStatisticsActions.recordPushSuccess(
      'test-project',
      'test-owner',
      'test-repo',
      'main'
    );

    expect(ChromeStorageService.savePushStatistics).toHaveBeenCalledWith(
      expect.objectContaining({
        totalSuccesses: 1,
        records: expect.arrayContaining([
          expect.objectContaining({
            success: true,
          }),
        ]),
      })
    );
  });

  it('should get statistics summary', async () => {
    const mockStatistics = {
      totalAttempts: 10,
      totalSuccesses: 8,
      totalFailures: 2,
      lastPushTimestamp: Date.now(),
      lastSuccessTimestamp: Date.now() - 1000,
      records: [],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(
      mockStatistics
    );

    const summary = await pushStatisticsActions.getStatisticsSummary();

    expect(summary.totalAttempts).toBe(10);
    expect(summary.totalSuccesses).toBe(8);
    expect(summary.totalFailures).toBe(2);
    expect(summary.successRate).toBe(80);
    expect(summary.lastPushDate).toBeInstanceOf(Date);
    expect(summary.lastSuccessDate).toBeInstanceOf(Date);
  });

  it('should clear statistics', async () => {
    (ChromeStorageService.clearPushStatistics as MockedFunction<any>).mockResolvedValue(undefined);

    await pushStatisticsActions.clearStatistics();

    expect(ChromeStorageService.clearPushStatistics).toHaveBeenCalled();

    const state = get(pushStatisticsStore);
    expect(state.statistics.totalAttempts).toBe(0);
    expect(state.statistics.totalSuccesses).toBe(0);
    expect(state.statistics.totalFailures).toBe(0);
    expect(state.statistics.records).toEqual([]);
  });

  it('should check if user has push attempts', async () => {
    // Test with no push attempts
    const emptyStats = {
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      records: [],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(emptyStats);

    const hasNoAttempts = await pushStatisticsActions.hasPushAttempts();
    expect(hasNoAttempts).toBe(false);

    // Test with push attempts
    const statsWithAttempts = {
      totalAttempts: 3,
      totalSuccesses: 2,
      totalFailures: 1,
      records: [],
    };

    (ChromeStorageService.getPushStatistics as MockedFunction<any>).mockResolvedValue(
      statsWithAttempts
    );

    const hasAttempts = await pushStatisticsActions.hasPushAttempts();
    expect(hasAttempts).toBe(true);
  });
});
