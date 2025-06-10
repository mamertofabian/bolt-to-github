/* eslint-env jest */

import { DropdownManager } from '../DropdownManager';
import type { MessageHandler } from '../../MessageHandler';
import type { UIStateManager } from '../../services/UIStateManager';

describe('DropdownManager', () => {
  let dropdownManager: DropdownManager;
  let mockMessageHandler: jest.Mocked<MessageHandler>;
  let mockStateManager: jest.Mocked<UIStateManager>;
  let mockPushCallback: jest.Mock;
  let mockShowFilesCallback: jest.Mock;
  let mockUpgradeCallback: jest.Mock;
  let mockPremiumService: any;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    document.head.innerHTML = '';

    // Reset mocks
    jest.clearAllMocks();

    // Mock MessageHandler
    mockMessageHandler = {
      sendMessage: jest.fn(),
    } as any;

    // Mock UIStateManager
    mockStateManager = {
      // Add any needed methods here
    } as any;

    // Mock callback functions
    mockPushCallback = jest.fn().mockResolvedValue(undefined);
    mockShowFilesCallback = jest.fn().mockResolvedValue(undefined);
    mockUpgradeCallback = jest.fn().mockResolvedValue(undefined);

    // Mock PremiumService
    mockPremiumService = {
      isPremiumSync: jest.fn().mockReturnValue(true),
    };

    dropdownManager = new DropdownManager(
      mockMessageHandler,
      mockStateManager,
      mockPushCallback,
      mockShowFilesCallback,
      mockUpgradeCallback
    );

    // Mock setTimeout and addEventListener for proper async handling
    jest.spyOn(window, 'setTimeout').mockImplementation((callback) => {
      if (typeof callback === 'function') {
        callback();
      }
      return 123 as any;
    });
  });

  afterEach(() => {
    dropdownManager.cleanup();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    test('initializes without optional parameters', () => {
      const manager = new DropdownManager(mockMessageHandler);
      expect(manager).toBeInstanceOf(DropdownManager);
    });

    test('initializes with all parameters', () => {
      expect(dropdownManager).toBeInstanceOf(DropdownManager);
    });

    test('sets premium service correctly', () => {
      expect(() => {
        dropdownManager.setPremiumService(mockPremiumService);
      }).not.toThrow();
    });
  });

  describe('Dropdown Content Creation', () => {
    beforeEach(() => {
      dropdownManager.setPremiumService(mockPremiumService);
    });

    test('creates dropdown content with correct structure', () => {
      const content = dropdownManager.createContent();

      expect(content.id).toBe('github-dropdown-content');
      expect(content.getAttribute('role')).toBe('menu');
      expect(content.className).toContain('rounded-md');
      expect(content.className).toContain('shadow-lg');
      expect(content.className).toContain('min-w-[180px]');
      expect(content.className).toContain('animate-fadeIn');
    });

    test('creates dropdown with all menu items', () => {
      const content = dropdownManager.createContent();
      const buttons = content.querySelectorAll('button');

      expect(buttons.length).toBe(6); // Push, Dashboard, Files, Issues, Projects, Settings

      // Check button texts
      const buttonTexts = Array.from(buttons).map((btn) => btn.textContent?.trim());
      expect(buttonTexts).toContain('Push to GitHub');
      expect(buttonTexts).toContain('Project Dashboard');
      expect(buttonTexts).toContain('Show Changed Files');
      expect(buttonTexts).toContain('Manage Issues');
      expect(buttonTexts).toContain('Projects');
      expect(buttonTexts).toContain('Settings');
    });

    test('adds custom styles to document head', () => {
      dropdownManager.createContent();

      const styles = document.getElementById('github-dropdown-styles');
      expect(styles).toBeTruthy();
      expect(styles?.textContent).toContain('@keyframes fadeIn');
      expect(styles?.textContent).toContain('#github-dropdown-content');
    });

    test('does not duplicate styles when called multiple times', () => {
      dropdownManager.createContent();
      dropdownManager.createContent();

      const styles = document.querySelectorAll('#github-dropdown-styles');
      expect(styles.length).toBe(1);
    });
  });

  describe('Premium Features', () => {
    test('shows premium items correctly for premium users', () => {
      mockPremiumService.isPremiumSync.mockReturnValue(true);
      dropdownManager.setPremiumService(mockPremiumService);

      const content = dropdownManager.createContent();
      const buttons = content.querySelectorAll('button');

      const changedFilesButton = Array.from(buttons).find((btn) =>
        btn.textContent?.includes('Show Changed Files')
      );
      const issuesButton = Array.from(buttons).find((btn) =>
        btn.textContent?.includes('Manage Issues')
      );

      expect(changedFilesButton?.className).not.toContain('opacity-75');
      expect(issuesButton?.className).not.toContain('opacity-75');
      expect(changedFilesButton?.innerHTML).not.toContain('PRO');
      expect(issuesButton?.innerHTML).not.toContain('PRO');
    });

    test('shows premium indicators for free users', () => {
      mockPremiumService.isPremiumSync.mockReturnValue(false);
      dropdownManager.setPremiumService(mockPremiumService);

      const content = dropdownManager.createContent();
      const buttons = content.querySelectorAll('button');

      const changedFilesButton = Array.from(buttons).find((btn) =>
        btn.textContent?.includes('Show Changed Files')
      );
      const issuesButton = Array.from(buttons).find((btn) =>
        btn.textContent?.includes('Manage Issues')
      );

      expect(changedFilesButton?.className).toContain('opacity-75');
      expect(issuesButton?.className).toContain('opacity-75');
      expect(changedFilesButton?.innerHTML).toContain('PRO');
      expect(issuesButton?.innerHTML).toContain('PRO');
    });

    test('handles missing premium service gracefully', () => {
      // Don't set premium service
      const content = dropdownManager.createContent();
      const buttons = content.querySelectorAll('button');

      // Should default to free user experience
      const changedFilesButton = Array.from(buttons).find((btn) =>
        btn.textContent?.includes('Show Changed Files')
      );

      expect(changedFilesButton?.className).toContain('opacity-75');
      expect(changedFilesButton?.innerHTML).toContain('PRO');
    });
  });

  describe('Dropdown Display and Positioning', () => {
    let mockButton: HTMLButtonElement;

    beforeEach(() => {
      // Create a mock button
      mockButton = document.createElement('button');
      mockButton.style.position = 'absolute';
      mockButton.style.top = '100px';
      mockButton.style.left = '200px';
      mockButton.style.width = '150px';
      mockButton.style.height = '40px';
      document.body.appendChild(mockButton);

      // Mock getBoundingClientRect
      jest.spyOn(mockButton, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        left: 200,
        bottom: 140,
        right: 350,
        width: 150,
        height: 40,
        x: 200,
        y: 100,
        toJSON: jest.fn(),
      });

      dropdownManager.setPremiumService(mockPremiumService);
    });

    test('shows dropdown correctly', async () => {
      await dropdownManager.show(mockButton);

      const dropdown = document.getElementById('github-dropdown-content');
      expect(dropdown).toBeTruthy();
      expect(dropdown?.style.display).toBe('block');
      expect(dropdown?.style.position).toBe('fixed');
      expect(dropdown?.style.zIndex).toBe('9999');
    });

    test('positions dropdown below button', async () => {
      await dropdownManager.show(mockButton);

      const dropdown = document.getElementById('github-dropdown-content');
      expect(dropdown?.style.top).toBe('140px'); // button.bottom
      expect(dropdown?.style.left).toBe('200px'); // button.left
    });

    test('dispatches keydown event on button', async () => {
      const dispatchSpy = jest.spyOn(mockButton, 'dispatchEvent');

      await dropdownManager.show(mockButton);

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        })
      );
    });

    test('removes existing dropdown before creating new one', async () => {
      // Create an existing dropdown
      const existingDropdown = document.createElement('div');
      existingDropdown.id = 'github-dropdown-content';
      document.body.appendChild(existingDropdown);

      await dropdownManager.show(mockButton);

      const dropdowns = document.querySelectorAll('#github-dropdown-content');
      expect(dropdowns.length).toBe(1);
    });

    test('adds window resize listener', async () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

      await dropdownManager.show(mockButton);

      expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    test('adds click outside listener', async () => {
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

      await dropdownManager.show(mockButton);

      expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));
    });
  });

  describe('Dropdown Hide Functionality', () => {
    let mockButton: HTMLButtonElement;

    beforeEach(() => {
      mockButton = document.createElement('button');
      document.body.appendChild(mockButton);

      jest.spyOn(mockButton, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        left: 200,
        bottom: 140,
        right: 350,
        width: 150,
        height: 40,
        x: 200,
        y: 100,
        toJSON: jest.fn(),
      });

      dropdownManager.setPremiumService(mockPremiumService);
    });

    test('hides dropdown correctly', async () => {
      await dropdownManager.show(mockButton);

      const dropdown = document.getElementById('github-dropdown-content');
      expect(dropdown?.style.display).toBe('block');

      dropdownManager.hide();

      expect(dropdown?.style.display).toBe('none');
    });

    test('removes event listeners on hide', async () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      await dropdownManager.show(mockButton);
      dropdownManager.hide();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    test('handles hide when no dropdown is shown', () => {
      expect(() => {
        dropdownManager.hide();
      }).not.toThrow();
    });
  });

  describe('Premium Status Updates', () => {
    let mockButton: HTMLButtonElement;

    beforeEach(() => {
      mockButton = document.createElement('button');
      document.body.appendChild(mockButton);

      jest.spyOn(mockButton, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        left: 200,
        bottom: 140,
        right: 350,
        width: 150,
        height: 40,
        x: 200,
        y: 100,
        toJSON: jest.fn(),
      });

      dropdownManager.setPremiumService(mockPremiumService);
    });

    test('updates premium status when dropdown is visible', async () => {
      await dropdownManager.show(mockButton);

      const refreshSpy = jest.spyOn(dropdownManager, 'refreshDropdownContent');

      dropdownManager.updatePremiumStatus();

      expect(refreshSpy).toHaveBeenCalled();
    });

    test('does not refresh when dropdown is hidden', () => {
      const refreshSpy = jest.spyOn(dropdownManager, 'refreshDropdownContent');

      dropdownManager.updatePremiumStatus();

      expect(refreshSpy).not.toHaveBeenCalled();
    });

    test('refreshes dropdown content correctly', async () => {
      await dropdownManager.show(mockButton);

      const dropdown = document.getElementById('github-dropdown-content');
      const originalContent = dropdown?.innerHTML;

      // Change premium status
      mockPremiumService.isPremiumSync.mockReturnValue(false);

      dropdownManager.refreshDropdownContent();

      expect(dropdown?.innerHTML).not.toBe(originalContent);
    });

    test('handles refresh when no dropdown exists', () => {
      expect(() => {
        dropdownManager.refreshDropdownContent();
      }).not.toThrow();
    });
  });

  describe('Menu Item Interactions', () => {
    let content: HTMLElement;

    beforeEach(() => {
      dropdownManager.setPremiumService(mockPremiumService);
      content = dropdownManager.createContent();
      document.body.appendChild(content);
    });

    test('handles push button click', async () => {
      const hideSpy = jest.spyOn(dropdownManager, 'hide');
      const pushButton = Array.from(content.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Push to GitHub')
      );

      await pushButton?.click();

      expect(hideSpy).toHaveBeenCalled();
      expect(mockPushCallback).toHaveBeenCalled();
    });

    test('handles project dashboard button click', async () => {
      const hideSpy = jest.spyOn(dropdownManager, 'hide');
      const dashboardButton = Array.from(content.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Project Dashboard')
      );

      dashboardButton?.click();

      expect(hideSpy).toHaveBeenCalled();
      expect(mockMessageHandler.sendMessage).toHaveBeenCalledWith('OPEN_HOME');
    });

    test('handles changed files button for premium users', async () => {
      mockPremiumService.isPremiumSync.mockReturnValue(true);

      // Recreate content with premium status
      content.remove();
      content = dropdownManager.createContent();
      document.body.appendChild(content);

      const hideSpy = jest.spyOn(dropdownManager, 'hide');
      const filesButton = Array.from(content.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Show Changed Files')
      );

      await filesButton?.click();

      expect(hideSpy).toHaveBeenCalled();
      expect(mockShowFilesCallback).toHaveBeenCalled();
      expect(mockUpgradeCallback).not.toHaveBeenCalled();
    });

    test('handles changed files button for free users', async () => {
      mockPremiumService.isPremiumSync.mockReturnValue(false);

      // Recreate content with free status
      content.remove();
      content = dropdownManager.createContent();
      document.body.appendChild(content);

      const hideSpy = jest.spyOn(dropdownManager, 'hide');
      const filesButton = Array.from(content.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Show Changed Files')
      );

      await filesButton?.click();

      expect(hideSpy).toHaveBeenCalled();
      expect(mockUpgradeCallback).toHaveBeenCalledWith('file-changes');
      expect(mockShowFilesCallback).not.toHaveBeenCalled();
    });

    test('handles issues button for premium users', async () => {
      mockPremiumService.isPremiumSync.mockReturnValue(true);

      // Recreate content with premium status
      content.remove();
      content = dropdownManager.createContent();
      document.body.appendChild(content);

      const hideSpy = jest.spyOn(dropdownManager, 'hide');
      const issuesButton = Array.from(content.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Manage Issues')
      );

      await issuesButton?.click();

      expect(hideSpy).toHaveBeenCalled();
      expect(mockMessageHandler.sendMessage).toHaveBeenCalledWith('OPEN_ISSUES');
      expect(mockUpgradeCallback).not.toHaveBeenCalled();
    });

    test('handles issues button for free users', async () => {
      mockPremiumService.isPremiumSync.mockReturnValue(false);

      // Recreate content with free status
      content.remove();
      content = dropdownManager.createContent();
      document.body.appendChild(content);

      const hideSpy = jest.spyOn(dropdownManager, 'hide');
      const issuesButton = Array.from(content.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Manage Issues')
      );

      await issuesButton?.click();

      expect(hideSpy).toHaveBeenCalled();
      expect(mockUpgradeCallback).toHaveBeenCalledWith('issues');
      expect(mockMessageHandler.sendMessage).not.toHaveBeenCalledWith('OPEN_ISSUES');
    });

    test('handles projects button click', async () => {
      const hideSpy = jest.spyOn(dropdownManager, 'hide');
      const projectsButton = Array.from(content.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Projects')
      );

      projectsButton?.click();

      expect(hideSpy).toHaveBeenCalled();
      expect(mockMessageHandler.sendMessage).toHaveBeenCalledWith('OPEN_PROJECTS');
    });

    test('handles settings button click', async () => {
      const hideSpy = jest.spyOn(dropdownManager, 'hide');
      const settingsButton = Array.from(content.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Settings')
      );

      settingsButton?.click();

      expect(hideSpy).toHaveBeenCalled();
      expect(mockMessageHandler.sendMessage).toHaveBeenCalledWith('OPEN_SETTINGS');
    });
  });

  describe('Event Handling', () => {
    let mockButton: HTMLButtonElement;

    beforeEach(() => {
      mockButton = document.createElement('button');
      document.body.appendChild(mockButton);

      jest.spyOn(mockButton, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        left: 200,
        bottom: 140,
        right: 350,
        width: 150,
        height: 40,
        x: 200,
        y: 100,
        toJSON: jest.fn(),
      });

      dropdownManager.setPremiumService(mockPremiumService);
    });

    test('handles click outside dropdown', async () => {
      // Mock setTimeout to control timing
      const originalSetTimeout = window.setTimeout;
      jest.spyOn(window, 'setTimeout').mockImplementation((callback, delay) => {
        if (delay === 100) {
          // Simulate the delayed click listener setup
          setTimeout(() => {
            if (typeof callback === 'function') {
              callback();
            }
          }, 0);
        } else if (typeof callback === 'function') {
          callback();
        }
        return 123 as any;
      });

      await dropdownManager.show(mockButton);

      const hideSpy = jest.spyOn(dropdownManager, 'hide');
      const dropdown = document.getElementById('github-dropdown-content');

      // Simulate click outside
      const outsideElement = document.createElement('div');
      document.body.appendChild(outsideElement);

      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(clickEvent, 'target', { value: outsideElement });

      // Wait for the click listener to be added
      await new Promise((resolve) => setTimeout(resolve, 0));

      document.dispatchEvent(clickEvent);

      expect(hideSpy).toHaveBeenCalled();

      // Restore setTimeout
      window.setTimeout = originalSetTimeout;
    });

    test('does not hide when clicking inside dropdown', async () => {
      await dropdownManager.show(mockButton);

      const hideSpy = jest.spyOn(dropdownManager, 'hide');
      const dropdown = document.getElementById('github-dropdown-content');

      // Simulate click inside dropdown
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(clickEvent, 'target', { value: dropdown });

      document.dispatchEvent(clickEvent);

      expect(hideSpy).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('handles missing callbacks gracefully', async () => {
      const managerWithoutCallbacks = new DropdownManager(mockMessageHandler);
      managerWithoutCallbacks.setPremiumService(mockPremiumService);

      const content = managerWithoutCallbacks.createContent();
      const pushButton = Array.from(content.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Push to GitHub')
      );

      // Should not throw error
      expect(() => {
        pushButton?.click();
      }).not.toThrow();
    });

    test('handles missing premium service in button clicks', async () => {
      const managerWithoutPremium = new DropdownManager(mockMessageHandler);

      const content = managerWithoutPremium.createContent();
      const filesButton = Array.from(content.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Show Changed Files')
      );

      // Should not throw error and should show upgrade prompt
      expect(() => {
        filesButton?.click();
      }).not.toThrow();
    });

    test('handles missing upgrade callback gracefully', async () => {
      const managerWithoutUpgrade = new DropdownManager(
        mockMessageHandler,
        mockStateManager,
        mockPushCallback,
        mockShowFilesCallback
        // No upgrade callback
      );

      mockPremiumService.isPremiumSync.mockReturnValue(false);
      managerWithoutUpgrade.setPremiumService(mockPremiumService);

      const content = managerWithoutUpgrade.createContent();
      const filesButton = Array.from(content.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Show Changed Files')
      );

      // Should not throw error and should log fallback message
      expect(() => {
        filesButton?.click();
      }).not.toThrow();
    });
  });

  describe('Cleanup', () => {
    test('removes dropdown content on cleanup', () => {
      const content = dropdownManager.createContent();
      document.body.appendChild(content);

      expect(document.getElementById('github-dropdown-content')).toBeTruthy();

      dropdownManager.cleanup();

      expect(document.getElementById('github-dropdown-content')).toBeNull();
    });

    test('removes styles on cleanup', () => {
      dropdownManager.createContent();

      expect(document.getElementById('github-dropdown-styles')).toBeTruthy();

      dropdownManager.cleanup();

      expect(document.getElementById('github-dropdown-styles')).toBeNull();
    });

    test('hides dropdown on cleanup', () => {
      const hideSpy = jest.spyOn(dropdownManager, 'hide');

      dropdownManager.cleanup();

      expect(hideSpy).toHaveBeenCalled();
    });

    test('handles cleanup when no dropdown exists', () => {
      expect(() => {
        dropdownManager.cleanup();
      }).not.toThrow();
    });
  });
});
