/* eslint-disable @typescript-eslint/no-explicit-any */

import { afterEach, beforeEach, describe, expect, it, type Mock, type Mocked, vi } from 'vitest';
import { SettingsService } from '../../../services/settings';
import type { UIStateManager } from '../../services/UIStateManager';
import { GitHubButtonManager } from '../GitHubButtonManager';

// Mock SettingsService
vi.mock('../../../services/settings', () => ({
  SettingsService: {
    getGitHubSettings: vi.fn(),
  },
}));

describe('GitHubButtonManager', () => {
  let githubButtonManager: GitHubButtonManager;
  let mockStateManager: Mocked<UIStateManager>;
  let mockDropdownCallback: Mock;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Reset mocks
    vi.clearAllMocks();

    // Mock state manager
    mockStateManager = {
      setButtonState: vi.fn(),
    } as any;

    // Mock dropdown callback
    mockDropdownCallback = vi.fn().mockResolvedValue(undefined);

    githubButtonManager = new GitHubButtonManager(mockStateManager, mockDropdownCallback);

    // Mock SettingsService default response
    (SettingsService.getGitHubSettings as any).mockResolvedValue({
      isSettingsValid: true,
    });
  });

  afterEach(() => {
    githubButtonManager.cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('initializes without state manager and callback', () => {
      const manager = new GitHubButtonManager();
      expect(manager).toBeInstanceOf(GitHubButtonManager);
      expect(manager.isInitialized()).toBe(false);
    });

    it('initializes with state manager and callback', () => {
      expect(githubButtonManager).toBeInstanceOf(GitHubButtonManager);
      expect(githubButtonManager.isInitialized()).toBe(false);
    });

    it('skips initialization when button container is missing', async () => {
      // No button container in DOM
      await githubButtonManager.initialize();

      expect(githubButtonManager.isInitialized()).toBe(false);
      expect(githubButtonManager.getButton()).toBeNull();
    });

    it('skips initialization when existing button is found', async () => {
      // Set up button container
      const container = document.createElement('div');
      container.className = 'flex grow-1 basis-60';
      const innerContainer = document.createElement('div');
      innerContainer.className = 'flex gap-2';
      container.appendChild(innerContainer);
      document.body.appendChild(container);

      // Add existing button
      const existingButton = document.createElement('button');
      existingButton.setAttribute('data-github-upload', 'true');
      document.body.appendChild(existingButton);

      await githubButtonManager.initialize();

      expect(githubButtonManager.isInitialized()).toBe(false);
    });

    it('successfully initializes button when conditions are met', async () => {
      // Set up button container
      const container = document.createElement('div');
      container.className = 'flex grow-1 basis-60';
      const innerContainer = document.createElement('div');
      innerContainer.className = 'flex gap-2';

      // Add a deploy button to test button placement
      const deployButton = document.createElement('button');
      deployButton.textContent = 'Deploy';
      innerContainer.appendChild(deployButton);

      container.appendChild(innerContainer);
      document.body.appendChild(container);

      await githubButtonManager.initialize();

      expect(githubButtonManager.isInitialized()).toBe(true);
      expect(SettingsService.getGitHubSettings).toHaveBeenCalled();

      const button = githubButtonManager.getButton();
      expect(button).toBeTruthy();
      expect(button?.getAttribute('data-github-upload')).toBe('true');
      expect(button?.getAttribute('data-testid')).toBe('github-upload-button');
    });

    it('places button before deploy button when available', async () => {
      // Set up button container with deploy button
      const container = document.createElement('div');
      container.className = 'flex grow-1 basis-60';
      const innerContainer = document.createElement('div');
      innerContainer.className = 'flex gap-2';

      const deployButton = document.createElement('button');
      deployButton.textContent = 'Deploy';
      innerContainer.appendChild(deployButton);

      container.appendChild(innerContainer);
      document.body.appendChild(container);

      await githubButtonManager.initialize();

      const githubButton = githubButtonManager.getButton();
      expect(githubButton?.nextElementSibling).toBe(deployButton);
    });

    it('handles settings service errors gracefully', async () => {
      (SettingsService.getGitHubSettings as any).mockRejectedValue(new Error('Settings error'));

      // Set up button container
      const container = document.createElement('div');
      container.className = 'flex grow-1 basis-60';
      const innerContainer = document.createElement('div');
      innerContainer.className = 'flex gap-2';
      container.appendChild(innerContainer);
      document.body.appendChild(container);

      // Should not throw error
      await expect(githubButtonManager.initialize()).rejects.toThrow('Settings error');
    });
  });

  describe('Button Creation', () => {
    beforeEach(async () => {
      // Set up button container for tests
      const container = document.createElement('div');
      container.className = 'flex grow-1 basis-60';
      const innerContainer = document.createElement('div');
      innerContainer.className = 'flex gap-2';
      container.appendChild(innerContainer);
      document.body.appendChild(container);

      await githubButtonManager.initialize();
    });

    it('creates button with correct attributes', () => {
      const button = githubButtonManager.getButton();

      expect(button?.tagName).toBe('BUTTON');
      expect(button?.getAttribute('data-github-upload')).toBe('true');
      expect(button?.getAttribute('data-testid')).toBe('github-upload-button');
      expect(button?.getAttribute('aria-haspopup')).toBe('menu');
    });

    it('creates button with correct CSS classes', () => {
      const button = githubButtonManager.getButton() as HTMLButtonElement;

      expect(button.className).toContain('rounded-md');
      expect(button.className).toContain('flex');
      expect(button.className).toContain('items-center');
      expect(button.className).toContain('bg-bolt-elements-button-secondary-background');
    });

    it('creates button with GitHub icon and text', () => {
      const button = githubButtonManager.getButton();

      expect(button?.innerHTML).toContain('GitHub');
      expect(button?.innerHTML).toContain('svg');
      expect(button?.innerHTML).toContain('viewBox="0 0 16 16"'); // GitHub icon
      expect(button?.innerHTML).toContain('viewBox="0 0 24 24"'); // Dropdown arrow
    });

    it('adds click event listener to button', async () => {
      const button = githubButtonManager.getButton() as HTMLButtonElement;

      // Simulate button click
      button.click();

      expect(mockDropdownCallback).toHaveBeenCalledWith(button);
    });
  });

  describe('State Management', () => {
    beforeEach(async () => {
      // Set up button container for tests
      const container = document.createElement('div');
      container.className = 'flex grow-1 basis-60';
      const innerContainer = document.createElement('div');
      innerContainer.className = 'flex gap-2';
      container.appendChild(innerContainer);
      document.body.appendChild(container);

      await githubButtonManager.initialize();
    });

    it('updates button to valid state', () => {
      const button = githubButtonManager.getButton() as HTMLButtonElement;

      githubButtonManager.updateState(true);

      expect(button.disabled).toBe(false);
      expect(button.className).not.toContain('opacity-50');
      expect(button.className).toContain(
        'enabled:hover:bg-bolt-elements-button-secondary-backgroundHover'
      );
      expect(mockStateManager.setButtonState).toHaveBeenCalledWith(true);
    });

    it('updates button to invalid state', () => {
      const button = githubButtonManager.getButton() as HTMLButtonElement;

      githubButtonManager.updateState(false);

      expect(button.disabled).toBe(true);
      expect(button.className).toContain('opacity-50');
      expect(button.className).not.toContain(
        'enabled:hover:bg-bolt-elements-button-secondary-backgroundHover'
      );
      expect(mockStateManager.setButtonState).toHaveBeenCalledWith(false);
    });

    it('handles state update when button is not initialized', () => {
      const uninitializedManager = new GitHubButtonManager(mockStateManager);

      // Should not throw error
      expect(() => {
        uninitializedManager.updateState(true);
      }).not.toThrow();

      expect(mockStateManager.setButtonState).not.toHaveBeenCalled();
    });

    it('sets processing state correctly', () => {
      const button = githubButtonManager.getButton() as HTMLButtonElement;

      githubButtonManager.setProcessingState();

      expect(button.disabled).toBe(true);
      expect(button.innerHTML).toContain('Uploading...');
      expect(button.innerHTML).toContain('animate-spin');
    });

    it('sets detecting changes state correctly', () => {
      const button = githubButtonManager.getButton() as HTMLButtonElement;

      githubButtonManager.setDetectingChangesState();

      expect(button.disabled).toBe(true);
      expect(button.innerHTML).toContain('Detecting changes...');
      expect(button.innerHTML).toContain('animate-spin');
    });

    it('sets pushing state correctly', () => {
      const button = githubButtonManager.getButton() as HTMLButtonElement;

      githubButtonManager.setPushingState();

      expect(button.disabled).toBe(true);
      expect(button.innerHTML).toContain('Pushing...');
      expect(button.innerHTML).toContain('animate-spin');
    });

    it('sets custom loading state correctly', () => {
      const button = githubButtonManager.getButton() as HTMLButtonElement;
      const customText = 'Custom loading...';

      githubButtonManager.setLoadingState(customText);

      expect(button.disabled).toBe(true);
      expect(button.innerHTML).toContain(customText);
      expect(button.innerHTML).toContain('animate-spin');
    });

    it('resets button state correctly', () => {
      const button = githubButtonManager.getButton() as HTMLButtonElement;

      // First set to loading state
      githubButtonManager.setProcessingState();
      expect(button.disabled).toBe(true);

      // Then reset
      githubButtonManager.resetState();

      expect(button.disabled).toBe(false);
      expect(button.innerHTML).toContain('GitHub');
      expect(button.innerHTML).not.toContain('animate-spin');
    });
  });

  describe('Button Queries', () => {
    it('reports initialization state correctly', async () => {
      expect(githubButtonManager.isInitialized()).toBe(false);

      // Set up button container
      const container = document.createElement('div');
      container.className = 'flex grow-1 basis-60';
      const innerContainer = document.createElement('div');
      innerContainer.className = 'flex gap-2';
      container.appendChild(innerContainer);
      document.body.appendChild(container);

      await githubButtonManager.initialize();

      expect(githubButtonManager.isInitialized()).toBe(true);

      githubButtonManager.cleanup();

      expect(githubButtonManager.isInitialized()).toBe(false);
    });

    it('checks button existence in DOM correctly', async () => {
      expect(githubButtonManager.buttonExists()).toBe(false);

      // Add an existing button to DOM
      const existingButton = document.createElement('button');
      existingButton.setAttribute('data-github-upload', 'true');
      document.body.appendChild(existingButton);

      expect(githubButtonManager.buttonExists()).toBe(true);
    });

    it('returns correct button element', async () => {
      expect(githubButtonManager.getButton()).toBeNull();

      // Set up and initialize
      const container = document.createElement('div');
      container.className = 'flex grow-1 basis-60';
      const innerContainer = document.createElement('div');
      innerContainer.className = 'flex gap-2';
      container.appendChild(innerContainer);
      document.body.appendChild(container);

      await githubButtonManager.initialize();

      const button = githubButtonManager.getButton();
      expect(button).toBeTruthy();
      expect(button?.getAttribute('data-github-upload')).toBe('true');
    });
  });

  describe('Cleanup', () => {
    it('removes button and resets state', async () => {
      // Set up button container
      const container = document.createElement('div');
      container.className = 'flex grow-1 basis-60';
      const innerContainer = document.createElement('div');
      innerContainer.className = 'flex gap-2';
      container.appendChild(innerContainer);
      document.body.appendChild(container);

      await githubButtonManager.initialize();

      const button = githubButtonManager.getButton();
      expect(button).toBeTruthy();
      expect(githubButtonManager.isInitialized()).toBe(true);

      githubButtonManager.cleanup();

      expect(document.querySelector('[data-github-upload]')).toBeNull();
      expect(githubButtonManager.isInitialized()).toBe(false);
      expect(githubButtonManager.getButton()).toBeNull();
    });

    it('handles cleanup when button is not initialized', () => {
      // Should not throw error
      expect(() => {
        githubButtonManager.cleanup();
      }).not.toThrow();
    });

    it('can reinitialize after cleanup', async () => {
      // Set up button container
      const container = document.createElement('div');
      container.className = 'flex grow-1 basis-60';
      const innerContainer = document.createElement('div');
      innerContainer.className = 'flex gap-2';
      container.appendChild(innerContainer);
      document.body.appendChild(container);

      await githubButtonManager.initialize();
      expect(githubButtonManager.isInitialized()).toBe(true);

      githubButtonManager.cleanup();
      expect(githubButtonManager.isInitialized()).toBe(false);

      await githubButtonManager.initialize();
      expect(githubButtonManager.isInitialized()).toBe(true);

      const button = githubButtonManager.getButton();
      expect(button).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('handles missing state manager gracefully', async () => {
      const managerWithoutState = new GitHubButtonManager();

      // Set up button container
      const container = document.createElement('div');
      container.className = 'flex grow-1 basis-60';
      const innerContainer = document.createElement('div');
      innerContainer.className = 'flex gap-2';
      container.appendChild(innerContainer);
      document.body.appendChild(container);

      await managerWithoutState.initialize();

      // Should not throw error when updating state without state manager
      expect(() => {
        managerWithoutState.updateState(true);
      }).not.toThrow();
    });

    it('handles missing callback gracefully', async () => {
      const managerWithoutCallback = new GitHubButtonManager(mockStateManager);

      // Set up button container
      const container = document.createElement('div');
      container.className = 'flex grow-1 basis-60';
      const innerContainer = document.createElement('div');
      innerContainer.className = 'flex gap-2';
      container.appendChild(innerContainer);
      document.body.appendChild(container);

      await managerWithoutCallback.initialize();

      const button = managerWithoutCallback.getButton() as HTMLButtonElement;

      // Should not throw error when clicking without callback
      expect(() => {
        button.click();
      }).not.toThrow();
    });

    it('handles state updates on uninitialized button', () => {
      const methods = [
        () => githubButtonManager.setProcessingState(),
        () => githubButtonManager.setDetectingChangesState(),
        () => githubButtonManager.setPushingState(),
        () => githubButtonManager.setLoadingState('test'),
        () => githubButtonManager.resetState(),
        () => githubButtonManager.updateState(true),
      ];

      methods.forEach((method) => {
        expect(() => method()).not.toThrow();
      });
    });
  });

  describe('Integration with Settings', () => {
    it('calls SettingsService during initialization', async () => {
      // Set up button container
      const container = document.createElement('div');
      container.className = 'flex grow-1 basis-60';
      const innerContainer = document.createElement('div');
      innerContainer.className = 'flex gap-2';
      container.appendChild(innerContainer);
      document.body.appendChild(container);

      await githubButtonManager.initialize();

      expect(SettingsService.getGitHubSettings).toHaveBeenCalled();
    });
  });
});
