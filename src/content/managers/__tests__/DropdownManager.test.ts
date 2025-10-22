/* eslint-disable @typescript-eslint/no-explicit-any */

import { afterEach, beforeEach, describe, expect, test, vi, type Mock, type Mocked } from 'vitest';
import type { MessageHandler } from '../../MessageHandler';
import type { UIStateManager } from '../../services/UIStateManager';
import { DropdownManager } from '../DropdownManager';

describe('DropdownManager', () => {
  let dropdownManager: DropdownManager;
  let mockMessageHandler: Mocked<MessageHandler>;
  let mockStateManager: Mocked<UIStateManager>;
  let mockPushCallback: Mock;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';

    vi.clearAllMocks();

    mockMessageHandler = {
      sendMessage: vi.fn(),
    } as any;

    mockStateManager = {} as any;

    mockPushCallback = vi.fn().mockResolvedValue(undefined);

    dropdownManager = new DropdownManager(mockMessageHandler, mockStateManager, mockPushCallback);

    vi.spyOn(window, 'setTimeout').mockImplementation((callback) => {
      if (typeof callback === 'function') {
        callback();
      }
      return 123 as any;
    });

    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');
    vi.spyOn(document, 'addEventListener');
    vi.spyOn(document, 'removeEventListener');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    dropdownManager.cleanup();
  });

  describe('Initialization', () => {
    test('initializes without optional parameters', () => {
      const manager = new DropdownManager(mockMessageHandler);
      expect(manager).toBeInstanceOf(DropdownManager);
    });

    test('initializes with all parameters', () => {
      expect(dropdownManager).toBeInstanceOf(DropdownManager);
    });
  });

  describe('Dropdown Content Creation', () => {
    test('creates dropdown content with correct structure', () => {
      const content = dropdownManager.createContent();

      expect(content).toBeInstanceOf(HTMLElement);
      expect(content.id).toBe('github-dropdown-content');
      expect(content.getAttribute('role')).toBe('menu');
      expect(content.className).toContain('rounded-md');
      expect(content.className).toContain('shadow-lg');
      expect(content.className).toContain('animate-fadeIn');
    });

    test('creates dropdown with correct menu items', () => {
      const content = dropdownManager.createContent();
      const buttons = content.querySelectorAll('button');

      expect(buttons.length).toBe(6);

      const buttonTexts = Array.from(buttons).map((btn) => btn.textContent?.trim());

      expect(buttonTexts[0]).toBe('Push to GitHub');
      expect(buttonTexts[1]).toBe('Project Dashboard');
      expect(buttonTexts[2]).toContain('Show Changed Files');
      expect(buttonTexts[3]).toContain('Manage Issues');
      expect(buttonTexts[4]).toBe('Projects');
      expect(buttonTexts[5]).toBe('Settings');
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

  describe('Dropdown Display and Positioning', () => {
    let mockButton: HTMLButtonElement;

    beforeEach(() => {
      mockButton = document.createElement('button');
      mockButton.getBoundingClientRect = vi.fn().mockReturnValue({
        bottom: 100,
        left: 50,
        right: 150,
        top: 80,
        width: 100,
        height: 20,
      });
      document.body.appendChild(mockButton);
    });

    test('shows dropdown correctly', async () => {
      await dropdownManager.show(mockButton);

      const dropdown = document.getElementById('github-dropdown-content');
      expect(dropdown).toBeTruthy();
      expect(dropdown?.style.display).toBe('block');
      expect(dropdown?.style.position).toBe('fixed');
      expect(dropdown?.style.zIndex).toBe('9999');
    });

    test('dispatches keydown event on button', async () => {
      const spy = vi.spyOn(mockButton, 'dispatchEvent');

      await dropdownManager.show(mockButton);

      expect(spy).toHaveBeenCalledWith(expect.any(KeyboardEvent));
    });

    test('removes existing dropdown before creating new one', async () => {
      await dropdownManager.show(mockButton);
      const firstDropdown = document.getElementById('github-dropdown-content');

      await dropdownManager.show(mockButton);
      const allDropdowns = document.querySelectorAll('#github-dropdown-content');

      expect(allDropdowns.length).toBe(1);
      expect(firstDropdown).not.toBe(document.getElementById('github-dropdown-content'));
    });
  });

  describe('Dropdown Hide Functionality', () => {
    test('hides dropdown correctly', () => {
      const dropdown = document.createElement('div');
      dropdown.id = 'github-dropdown-content';
      dropdown.style.display = 'block';
      document.body.appendChild(dropdown);

      (dropdownManager as any).currentDropdown = dropdown;

      dropdownManager.hide();

      expect(dropdown.style.display).toBe('none');
      expect((dropdownManager as any).currentDropdown).toBeNull();
    });

    test('handles hide when no dropdown is shown', () => {
      expect(() => {
        dropdownManager.hide();
      }).not.toThrow();
    });
  });

  describe('Menu Item Interactions', () => {
    test('handles push button click', async () => {
      const content = dropdownManager.createContent();
      const buttons = content.querySelectorAll('button');

      const pushButton = Array.from(buttons).find((btn) =>
        btn.textContent?.includes('Push to GitHub')
      );

      expect(pushButton).toBeTruthy();

      (dropdownManager as any).currentDropdown = { style: { display: 'block' } };

      pushButton?.click();

      expect(mockPushCallback).toHaveBeenCalled();
    });

    test('handles project dashboard button click', () => {
      const content = dropdownManager.createContent();
      const buttons = content.querySelectorAll('button');

      const dashboardButton = Array.from(buttons).find((btn) =>
        btn.textContent?.includes('Project Dashboard')
      );

      expect(dashboardButton).toBeTruthy();

      (dropdownManager as any).currentDropdown = { style: { display: 'block' } };

      dashboardButton?.click();

      expect(mockMessageHandler.sendMessage).toHaveBeenCalledWith('OPEN_HOME');
    });

    test('premium features show PRO badge when not premium', () => {
      const content = dropdownManager.createContent();
      const buttons = content.querySelectorAll('button');

      const changedFilesButton = Array.from(buttons).find((btn) =>
        btn.textContent?.includes('Show Changed Files')
      );
      expect(changedFilesButton?.innerHTML).toContain('PRO');
      expect(changedFilesButton?.className).toContain('opacity-75');

      const issuesButton = Array.from(buttons).find((btn) =>
        btn.textContent?.includes('Manage Issues')
      );
      expect(issuesButton?.innerHTML).toContain('PRO');
      expect(issuesButton?.className).toContain('opacity-75');
    });

    test('handles Settings button click', () => {
      const content = dropdownManager.createContent();
      const buttons = content.querySelectorAll('button');

      const settingsButton = Array.from(buttons).find((btn) =>
        btn.textContent?.includes('Settings')
      );

      (dropdownManager as any).currentDropdown = { style: { display: 'block' } };

      settingsButton?.click();

      expect(mockMessageHandler.sendMessage).toHaveBeenCalledWith('OPEN_SETTINGS');
    });

    test('handles Projects button click', () => {
      const content = dropdownManager.createContent();
      const buttons = content.querySelectorAll('button');

      const projectsButton = Array.from(buttons).find((btn) =>
        btn.textContent?.includes('Projects')
      );

      (dropdownManager as any).currentDropdown = { style: { display: 'block' } };

      projectsButton?.click();

      expect(mockMessageHandler.sendMessage).toHaveBeenCalledWith('OPEN_PROJECTS');
    });
  });

  describe('Cleanup', () => {
    test('removes dropdown content on cleanup', () => {
      const content = dropdownManager.createContent();
      document.body.appendChild(content);

      dropdownManager.cleanup();

      expect(document.getElementById('github-dropdown-content')).toBeNull();
    });

    test('removes styles on cleanup', () => {
      dropdownManager.createContent();

      dropdownManager.cleanup();

      expect(document.getElementById('github-dropdown-styles')).toBeNull();
    });

    test('handles cleanup when no dropdown exists', () => {
      expect(() => {
        dropdownManager.cleanup();
      }).not.toThrow();
    });
  });
});
