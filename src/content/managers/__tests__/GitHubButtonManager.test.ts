/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-env jest */

import { GitHubButtonManager } from '../GitHubButtonManager';
import type { UIStateManager } from '../../services/UIStateManager';
import { SettingsService } from '../../../services/settings';

// Mock SettingsService
jest.mock('../../../services/settings', () => ({
  SettingsService: {
    getGitHubSettings: jest.fn(),
  },
}));

describe('GitHubButtonManager', () => {
  let githubButtonManager: GitHubButtonManager;
  let mockStateManager: jest.Mocked<UIStateManager>;
  let mockDropdownCallback: jest.Mock;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Reset mocks
    jest.clearAllMocks();

    // Mock state manager
    mockStateManager = {
      setButtonState: jest.fn(),
    } as any;

    // Mock dropdown callback
    mockDropdownCallback = jest.fn().mockResolvedValue(undefined);

    githubButtonManager = new GitHubButtonManager(mockStateManager, mockDropdownCallback);

    // Mock SettingsService default response
    (SettingsService.getGitHubSettings as jest.Mock).mockResolvedValue({
      isSettingsValid: true,
    });
  });

  afterEach(() => {
    githubButtonManager.cleanup();
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    test('initializes without state manager and callback', () => {
      const manager = new GitHubButtonManager();
      expect(manager).toBeInstanceOf(GitHubButtonManager);
      expect(manager.isInitialized()).toBe(false);
    });

    test('initializes with state manager and callback', () => {
      expect(githubButtonManager).toBeInstanceOf(GitHubButtonManager);
      expect(githubButtonManager.isInitialized()).toBe(false);
    });

    test('skips initialization when button container is missing', async () => {
      // No button container in DOM
      await githubButtonManager.initialize();

      expect(githubButtonManager.isInitialized()).toBe(false);
      expect(githubButtonManager.getButton()).toBeNull();
    });

    test('skips initialization when existing button is found', async () => {
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

    test('successfully initializes button when conditions are met', async () => {
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

    test('places button before deploy button when available', async () => {
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

    test('handles settings service errors gracefully', async () => {
      (SettingsService.getGitHubSettings as jest.Mock).mockRejectedValue(
        new Error('Settings error')
      );

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

    test('creates button with correct attributes', () => {
      const button = githubButtonManager.getButton();

      expect(button?.tagName).toBe('BUTTON');
      expect(button?.getAttribute('data-github-upload')).toBe('true');
      expect(button?.getAttribute('data-testid')).toBe('github-upload-button');
      expect(button?.getAttribute('aria-haspopup')).toBe('menu');
    });

    test('creates button with correct CSS classes', () => {
      const button = githubButtonManager.getButton() as HTMLButtonElement;

      expect(button.className).toContain('rounded-md');
      expect(button.className).toContain('flex');
      expect(button.className).toContain('items-center');
      expect(button.className).toContain('bg-bolt-elements-button-secondary-background');
    });

    test('creates button with GitHub icon and text', () => {
      const button = githubButtonManager.getButton();

      expect(button?.innerHTML).toContain('GitHub');
      expect(button?.innerHTML).toContain('svg');
      expect(button?.innerHTML).toContain('viewBox="0 0 16 16"'); // GitHub icon
      expect(button?.innerHTML).toContain('viewBox="0 0 24 24"'); // Dropdown arrow
    });

    test('adds click event listener to button', async () => {
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

    test('updates button to valid state', () => {
      const button = githubButtonManager.getButton() as HTMLButtonElement;

      githubButtonManager.updateState(true);

      expect(button.disabled).toBe(false);
      expect(button.className).not.toContain('opacity-50');
      expect(button.className).toContain(
        'enabled:hover:bg-bolt-elements-button-secondary-backgroundHover'
      );
      expect(mockStateManager.setButtonState).toHaveBeenCalledWith(true);
    });

    test('updates button to invalid state', () => {
      const button = githubButtonManager.getButton() as HTMLButtonElement;

      githubButtonManager.updateState(false);

      expect(button.disabled).toBe(true);
      expect(button.className).toContain('opacity-50');
      expect(button.className).not.toContain(
        'enabled:hover:bg-bolt-elements-button-secondary-backgroundHover'
      );
      expect(mockStateManager.setButtonState).toHaveBeenCalledWith(false);
    });

    test('handles state update when button is not initialized', () => {
      const uninitializedManager = new GitHubButtonManager(mockStateManager);

      // Should not throw error
      expect(() => {
        uninitializedManager.updateState(true);
      }).not.toThrow();

      expect(mockStateManager.setButtonState).not.toHaveBeenCalled();
    });

    test('sets processing state correctly', () => {
      const button = githubButtonManager.getButton() as HTMLButtonElement;

      githubButtonManager.setProcessingState();

      expect(button.disabled).toBe(true);
      expect(button.innerHTML).toContain('Uploading...');
      expect(button.innerHTML).toContain('animate-spin');
    });

    test('sets detecting changes state correctly', () => {
      const button = githubButtonManager.getButton() as HTMLButtonElement;

      githubButtonManager.setDetectingChangesState();

      expect(button.disabled).toBe(true);
      expect(button.innerHTML).toContain('Detecting changes...');
      expect(button.innerHTML).toContain('animate-spin');
    });

    test('sets pushing state correctly', () => {
      const button = githubButtonManager.getButton() as HTMLButtonElement;

      githubButtonManager.setPushingState();

      expect(button.disabled).toBe(true);
      expect(button.innerHTML).toContain('Pushing...');
      expect(button.innerHTML).toContain('animate-spin');
    });

    test('sets custom loading state correctly', () => {
      const button = githubButtonManager.getButton() as HTMLButtonElement;
      const customText = 'Custom loading...';

      githubButtonManager.setLoadingState(customText);

      expect(button.disabled).toBe(true);
      expect(button.innerHTML).toContain(customText);
      expect(button.innerHTML).toContain('animate-spin');
    });

    test('resets button state correctly', () => {
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
    test('reports initialization state correctly', async () => {
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

    test('checks button existence in DOM correctly', async () => {
      expect(githubButtonManager.buttonExists()).toBe(false);

      // Add an existing button to DOM
      const existingButton = document.createElement('button');
      existingButton.setAttribute('data-github-upload', 'true');
      document.body.appendChild(existingButton);

      expect(githubButtonManager.buttonExists()).toBe(true);
    });

    test('returns correct button element', async () => {
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
    test('removes button and resets state', async () => {
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

    test('handles cleanup when button is not initialized', () => {
      // Should not throw error
      expect(() => {
        githubButtonManager.cleanup();
      }).not.toThrow();
    });

    test('can reinitialize after cleanup', async () => {
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
    test('handles missing state manager gracefully', async () => {
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

    test('handles missing callback gracefully', async () => {
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

    test('handles state updates on uninitialized button', () => {
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
    test('calls SettingsService during initialization', async () => {
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
