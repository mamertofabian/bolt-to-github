/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAppChromeMocks } from '../test-helpers/chrome-mocks';
import { mockUiStateActions, resetAllStoreMocks } from '../test-helpers/store-mocks';

describe('App.svelte - Popup Context Handling', () => {
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

  describe('Context Detection from Storage', () => {
    it('should retrieve popup context from Chrome storage', async () => {
      chromeMocks._setLocalStorage('popupContext', 'issues');
      chromeMocks._setLocalStorage('upgradeModalFeature', 'fileChanges');

      const result = await chrome.storage.local.get(['popupContext', 'upgradeModalFeature']);

      expect(result.popupContext).toBe('issues');
      expect(result.upgradeModalFeature).toBe('fileChanges');
    });

    it('should return undefined when no popup context exists', async () => {
      const result = await chrome.storage.local.get(['popupContext']);

      expect(result.popupContext).toBeUndefined();
    });

    it('should clear popup context from storage', async () => {
      chromeMocks._setLocalStorage('popupContext', 'projects');

      await chrome.storage.local.remove(['popupContext']);
      const result = await chrome.storage.local.get(['popupContext']);

      expect(result.popupContext).toBeUndefined();
    });
  });

  describe('Tab Switching Actions', () => {
    it('should switch to projects tab', () => {
      mockUiStateActions.setActiveTab('projects');

      expect(mockUiStateActions.setActiveTab).toHaveBeenCalledWith('projects');
    });

    it('should switch to settings tab', () => {
      mockUiStateActions.setActiveTab('settings');

      expect(mockUiStateActions.setActiveTab).toHaveBeenCalledWith('settings');
    });

    it('should switch to home tab', () => {
      mockUiStateActions.setActiveTab('home');

      expect(mockUiStateActions.setActiveTab).toHaveBeenCalledWith('home');
    });
  });

  describe('Status Messages', () => {
    it('should show status message', () => {
      mockUiStateActions.showStatus('Processing...', 3000);

      expect(mockUiStateActions.showStatus).toHaveBeenCalledWith('Processing...', 3000);
    });
  });
});
