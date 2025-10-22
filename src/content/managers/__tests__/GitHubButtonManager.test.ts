import { afterEach, beforeEach, describe, expect, it, type Mock, type Mocked, vi } from 'vitest';
import { SettingsService } from '../../../services/settings';
import type { UIStateManager } from '../../services/UIStateManager';
import { GitHubButtonManager } from '../GitHubButtonManager';

vi.mock('../../../services/settings', () => ({
  SettingsService: {
    getGitHubSettings: vi.fn(),
  },
}));

function createButtonContainer() {
  const mlAuto = document.createElement('div');
  mlAuto.className = 'ml-auto';

  const flexContainer = document.createElement('div');
  flexContainer.className = 'flex gap-3';

  const emptyDiv = document.createElement('div');
  emptyDiv.className = 'flex gap-1 empty:hidden';
  flexContainer.appendChild(emptyDiv);

  const githubButtonContainer = document.createElement('div');
  githubButtonContainer.className = 'flex gap-1';
  flexContainer.appendChild(githubButtonContainer);

  mlAuto.appendChild(flexContainer);
  document.body.appendChild(mlAuto);

  return { mlAuto, flexContainer, githubButtonContainer };
}

function getButtonFromDOM(): HTMLButtonElement | null {
  return document.querySelector('[data-github-upload]');
}

describe('GitHubButtonManager', () => {
  let manager: GitHubButtonManager;
  let mockStateManager: Mocked<UIStateManager>;
  let mockDropdownCallback: Mock;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();

    mockStateManager = {
      setButtonState: vi.fn(),
    } as unknown as Mocked<UIStateManager>;

    mockDropdownCallback = vi.fn().mockResolvedValue(undefined);

    (SettingsService.getGitHubSettings as Mock).mockResolvedValue({
      isSettingsValid: true,
    });

    manager = new GitHubButtonManager(mockStateManager, mockDropdownCallback);
  });

  afterEach(() => {
    manager.cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('Button Initialization', () => {
    it('creates button in DOM with correct attributes when container exists', async () => {
      createButtonContainer();

      await manager.initialize();

      const button = getButtonFromDOM();
      expect(button).toBeTruthy();
      expect(button?.getAttribute('data-github-upload')).toBe('true');
      expect(button?.getAttribute('data-testid')).toBe('github-upload-button');
      expect(button?.getAttribute('aria-haspopup')).toBe('menu');
    });

    it('creates button with GitHub icon and dropdown arrow', async () => {
      createButtonContainer();

      await manager.initialize();

      const button = getButtonFromDOM();
      expect(button?.innerHTML).toContain('GitHub');
      expect(button?.innerHTML).toContain('viewBox="0 0 16 16"');
      expect(button?.innerHTML).toContain('viewBox="0 0 24 24"');
    });

    it('creates enabled button when settings are valid', async () => {
      createButtonContainer();

      await manager.initialize();

      const button = getButtonFromDOM();
      expect(button?.disabled).toBe(false);
      expect(button?.className).not.toContain('opacity-50');
    });

    it('creates disabled button when settings are invalid', async () => {
      vi.clearAllMocks();
      (SettingsService.getGitHubSettings as Mock).mockResolvedValue({
        isSettingsValid: false,
      });

      createButtonContainer();
      const testManager = new GitHubButtonManager(mockStateManager, mockDropdownCallback);

      await testManager.initialize();

      const button = getButtonFromDOM();
      expect(button?.disabled).toBe(true);
      expect(button?.className).toContain('opacity-50');

      testManager.cleanup();
    });

    it('does not create button when container is missing', async () => {
      await manager.initialize();

      const button = getButtonFromDOM();
      expect(button).toBeNull();
    });

    it('does not create button when button already exists in DOM', async () => {
      createButtonContainer();
      const existingButton = document.createElement('button');
      existingButton.setAttribute('data-github-upload', 'true');
      document.body.appendChild(existingButton);

      await manager.initialize();

      const buttons = document.querySelectorAll('[data-github-upload]');
      expect(buttons.length).toBe(1);
      expect(buttons[0]).toBe(existingButton);
    });

    it('places button in GitHub button container', async () => {
      const { githubButtonContainer } = createButtonContainer();

      await manager.initialize();

      const button = getButtonFromDOM();
      expect(githubButtonContainer.contains(button)).toBe(true);
    });
  });

  describe('Button Click Interaction', () => {
    it('triggers callback when button is clicked', async () => {
      createButtonContainer();
      await manager.initialize();

      const button = getButtonFromDOM();
      button?.click();

      expect(mockDropdownCallback).toHaveBeenCalledWith(button);
    });

    it('does not throw error when clicked without callback', async () => {
      const managerWithoutCallback = new GitHubButtonManager(mockStateManager);
      createButtonContainer();
      await managerWithoutCallback.initialize();

      const button = getButtonFromDOM();
      expect(() => button?.click()).not.toThrow();

      managerWithoutCallback.cleanup();
    });
  });

  describe('Button State Updates', () => {
    beforeEach(async () => {
      createButtonContainer();
      await manager.initialize();
    });

    it('enables button and removes opacity when state is valid', () => {
      manager.updateState(false);

      manager.updateState(true);

      const button = getButtonFromDOM();
      expect(button?.disabled).toBe(false);
      expect(button?.className).not.toContain('opacity-50');
      expect(button?.className).toContain(
        'enabled:hover:bg-bolt-elements-button-secondary-backgroundHover'
      );
    });

    it('disables button and adds opacity when state is invalid', () => {
      manager.updateState(true);

      manager.updateState(false);

      const button = getButtonFromDOM();
      expect(button?.disabled).toBe(true);
      expect(button?.className).toContain('opacity-50');
      expect(button?.className).not.toContain(
        'enabled:hover:bg-bolt-elements-button-secondary-backgroundHover'
      );
    });

    it('does not throw error when updating state before initialization', () => {
      const uninitializedManager = new GitHubButtonManager(mockStateManager);

      expect(() => uninitializedManager.updateState(true)).not.toThrow();
    });
  });

  describe('Loading States', () => {
    beforeEach(async () => {
      createButtonContainer();
      await manager.initialize();
    });

    it('shows uploading state with spinner and disabled button', () => {
      manager.setProcessingState();

      const button = getButtonFromDOM();
      expect(button?.disabled).toBe(true);
      expect(button?.innerHTML).toContain('Uploading...');
      expect(button?.innerHTML).toContain('animate-spin');
    });

    it('shows detecting changes state with spinner and disabled button', () => {
      manager.setDetectingChangesState();

      const button = getButtonFromDOM();
      expect(button?.disabled).toBe(true);
      expect(button?.innerHTML).toContain('Detecting changes...');
      expect(button?.innerHTML).toContain('animate-spin');
    });

    it('shows pushing state with spinner and disabled button', () => {
      manager.setPushingState();

      const button = getButtonFromDOM();
      expect(button?.disabled).toBe(true);
      expect(button?.innerHTML).toContain('Pushing...');
      expect(button?.innerHTML).toContain('animate-spin');
    });

    it('shows custom loading text with spinner and disabled button', () => {
      const customText = 'Processing files...';

      manager.setLoadingState(customText);

      const button = getButtonFromDOM();
      expect(button?.disabled).toBe(true);
      expect(button?.innerHTML).toContain(customText);
      expect(button?.innerHTML).toContain('animate-spin');
    });

    it('does not throw error when setting loading state before initialization', () => {
      const uninitializedManager = new GitHubButtonManager(mockStateManager);

      expect(() => uninitializedManager.setProcessingState()).not.toThrow();
      expect(() => uninitializedManager.setDetectingChangesState()).not.toThrow();
      expect(() => uninitializedManager.setPushingState()).not.toThrow();
      expect(() => uninitializedManager.setLoadingState('test')).not.toThrow();
    });
  });

  describe('Button State Reset', () => {
    beforeEach(async () => {
      createButtonContainer();
      await manager.initialize();
    });

    it('restores button to normal state after loading', () => {
      manager.setProcessingState();

      manager.resetState();

      const button = getButtonFromDOM();
      expect(button?.disabled).toBe(false);
      expect(button?.innerHTML).toContain('GitHub');
      expect(button?.innerHTML).not.toContain('animate-spin');
      expect(button?.innerHTML).not.toContain('Uploading');
    });

    it('does not throw error when resetting state before initialization', () => {
      const uninitializedManager = new GitHubButtonManager(mockStateManager);

      expect(() => uninitializedManager.resetState()).not.toThrow();
    });
  });

  describe('Button Cleanup', () => {
    it('removes button from DOM', async () => {
      createButtonContainer();
      await manager.initialize();
      expect(getButtonFromDOM()).toBeTruthy();

      manager.cleanup();

      expect(getButtonFromDOM()).toBeNull();
    });

    it('allows reinitialization after cleanup', async () => {
      createButtonContainer();
      await manager.initialize();
      const firstButton = getButtonFromDOM();
      expect(firstButton).toBeTruthy();

      manager.cleanup();
      expect(getButtonFromDOM()).toBeNull();

      await manager.initialize();
      const secondButton = getButtonFromDOM();
      expect(secondButton).toBeTruthy();
      expect(secondButton).not.toBe(firstButton);
    });

    it('removes multiple orphaned buttons from DOM', () => {
      const button1 = document.createElement('button');
      button1.setAttribute('data-github-upload', 'true');
      document.body.appendChild(button1);

      const button2 = document.createElement('button');
      button2.setAttribute('data-github-upload', 'true');
      document.body.appendChild(button2);

      manager.cleanup();

      const remainingButtons = document.querySelectorAll('[data-github-upload]');
      expect(remainingButtons.length).toBe(0);
    });

    it('does not throw error when cleaning up before initialization', () => {
      expect(() => manager.cleanup()).not.toThrow();
    });
  });

  describe('Query Methods', () => {
    it('returns button element after initialization', async () => {
      createButtonContainer();
      await manager.initialize();

      const button = manager.getButton();

      expect(button).toBeTruthy();
      expect(button).toBe(getButtonFromDOM());
    });

    it('returns null before initialization', () => {
      const button = manager.getButton();

      expect(button).toBeNull();
    });

    it('detects existing button in DOM', () => {
      const existingButton = document.createElement('button');
      existingButton.setAttribute('data-github-upload', 'true');
      document.body.appendChild(existingButton);

      expect(manager.buttonExists()).toBe(true);
    });

    it('detects no button in DOM', () => {
      expect(manager.buttonExists()).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('does not create button when settings service throws error', async () => {
      (SettingsService.getGitHubSettings as Mock).mockRejectedValue(new Error('Settings error'));
      createButtonContainer();

      await expect(manager.initialize()).rejects.toThrow('Settings error');

      const button = getButtonFromDOM();
      expect(button).toBeNull();
    });
  });
});
