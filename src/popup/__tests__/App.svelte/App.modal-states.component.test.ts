/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAppChromeMocks } from '../test-helpers/chrome-mocks';

import {
  mockUiStateActions,
  mockPremiumStatusActions,
  resetAllStoreMocks,
} from '../test-helpers/store-mocks';

describe('App.svelte - Modal State Management', () => {
  let chromeMocks: ReturnType<typeof createAppChromeMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAllStoreMocks();
    chromeMocks = createAppChromeMocks();
    global.chrome = chromeMocks as unknown as typeof chrome;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Temp Repo Modal Behavior', () => {
    it('should show temp repo modal with data', () => {
      const tempRepoData = {
        owner: 'test-owner',
        tempRepo: 'temp-repo-123',
        originalRepo: 'my-repo',
        timestamp: Date.now(),
      };

      mockUiStateActions.showTempRepoModal(tempRepoData);

      expect(mockUiStateActions.showTempRepoModal).toHaveBeenCalledWith(tempRepoData);
    });

    it('should hide temp repo modal', () => {
      mockUiStateActions.hideTempRepoModal();

      expect(mockUiStateActions.hideTempRepoModal).toHaveBeenCalled();
    });

    it('should track temp repo deletion state', () => {
      mockUiStateActions.markTempRepoDeleted();

      expect(mockUiStateActions.markTempRepoDeleted).toHaveBeenCalled();
    });

    it('should track temp repo name usage state', () => {
      mockUiStateActions.markTempRepoNameUsed();

      expect(mockUiStateActions.markTempRepoNameUsed).toHaveBeenCalled();
    });
  });

  describe('UI State Actions', () => {
    it('should switch active tab', () => {
      mockUiStateActions.setActiveTab('projects');

      expect(mockUiStateActions.setActiveTab).toHaveBeenCalledWith('projects');
    });

    it('should show status message', () => {
      const message = 'Processing...';
      const duration = 3000;

      mockUiStateActions.showStatus(message, duration);

      expect(mockUiStateActions.showStatus).toHaveBeenCalledWith(message, duration);
    });

    it('should clear status message', () => {
      mockUiStateActions.clearStatus();

      expect(mockUiStateActions.clearStatus).toHaveBeenCalled();
    });
  });

  describe('Premium Status Behavior', () => {
    it('should initialize premium status', async () => {
      await mockPremiumStatusActions.initialize();

      expect(mockPremiumStatusActions.initialize).toHaveBeenCalled();
    });
  });
});
