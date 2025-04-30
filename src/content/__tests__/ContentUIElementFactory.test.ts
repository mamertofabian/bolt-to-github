import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { ContentUIElementFactory } from '../ContentUIElementFactory';
import type { NotificationOptions } from '../interfaces/ContentUIInterfaces';

describe('ContentUIElementFactory', () => {
  let factory: ContentUIElementFactory;

  // DOM cleanup after each test
  afterEach(() => {
    document.body.innerHTML = '';
    const styles = document.querySelectorAll('style');
    styles.forEach((style) => style.remove());
  });

  beforeEach(() => {
    factory = new ContentUIElementFactory();
  });

  describe('createUploadButton', () => {
    it('should create a button with GitHub attributes and styling', () => {
      const button = factory.createUploadButton();

      // Verify button attributes
      expect(button.tagName).toBe('BUTTON');
      expect(button.getAttribute('data-github-upload')).toBe('true');
      expect(button.getAttribute('data-testid')).toBe('github-upload-button');
      expect(button.getAttribute('aria-haspopup')).toBe('menu');

      // Verify button has GitHub icon
      expect(button.innerHTML).toContain('<svg');
      expect(button.innerHTML).toContain('GitHub');
    });
  });

  describe('createGitHubDropdown', () => {
    it('should create a dropdown with three menu items', () => {
      const dropdown = factory.createGitHubDropdown();

      // Verify dropdown structure
      expect(dropdown.id).toBe('github-dropdown-content');
      expect(dropdown.getAttribute('role')).toBe('menu');

      // Verify dropdown contains three buttons
      const buttons = dropdown.querySelectorAll('button');
      expect(buttons.length).toBe(3);

      // Verify button content
      expect(buttons[0].textContent?.trim()).toContain('Push to GitHub');
      expect(buttons[1].textContent?.trim()).toContain('Show Changed Files');
      expect(buttons[2].textContent?.trim()).toContain('Settings');
    });

    it('should add styles to the document head', () => {
      factory.createGitHubDropdown();

      // Verify styles were added to document head
      const styles = document.querySelectorAll('style');
      expect(styles.length).toBeGreaterThan(0);

      // Verify some style content
      const styleContent = styles[0].textContent;
      expect(styleContent).toContain('@keyframes fadeIn');
      expect(styleContent).toContain('#github-dropdown-content');
    });
  });

  describe('createNotificationElement', () => {
    it('should create error notification with correct styling', () => {
      const options: NotificationOptions = {
        type: 'error',
        message: 'Test error message',
      };

      const notification = factory.createNotificationElement(options);

      // Verify type-specific styling
      expect(notification.className).toContain('bg-red-500');
      expect(notification.innerHTML).toContain('Test error message');
      // Verify close button exists
      expect(notification.querySelector('button')).not.toBeNull();
    });

    it('should create success notification with correct styling', () => {
      const options: NotificationOptions = {
        type: 'success',
        message: 'Test success message',
      };

      const notification = factory.createNotificationElement(options);

      // Verify type-specific styling
      expect(notification.className).toContain('bg-green-500');
      expect(notification.innerHTML).toContain('Test success message');
    });

    it('should create info notification with correct styling', () => {
      const options: NotificationOptions = {
        type: 'info',
        message: 'Test info message',
      };

      const notification = factory.createNotificationElement(options);

      // Verify type-specific styling
      expect(notification.className).toContain('bg-blue-500');
      expect(notification.innerHTML).toContain('Test info message');
    });
  });

  describe('createUploadStatusContainer', () => {
    it('should create a container with correct id and positioning', () => {
      const container = factory.createUploadStatusContainer();

      // Verify container properties
      expect(container.id).toBe('bolt-to-github-upload-status-container');
      expect(container.style.zIndex).toBe('10000');
      expect(container.style.position).toBe('fixed');
      expect(container.style.top).toBe('20px');
      expect(container.style.right).toBe('20px');
    });
  });

  describe('createGitHubConfirmationDialog', () => {
    it('should create a dialog with confirmation buttons and commit message input', () => {
      const projectSettings = {
        repoName: 'test-repo',
        branch: 'main',
      };

      const dialog = factory.createGitHubConfirmationDialog(projectSettings);

      // Verify dialog overlay
      expect(dialog.className).toContain('fixed');
      expect(dialog.className).toContain('inset-0');

      // Verify dialog content
      const dialogContent = dialog.querySelector('div');
      expect(dialogContent).not.toBeNull();

      // Verify project settings displayed
      expect(dialog.innerHTML).toContain('test-repo');
      expect(dialog.innerHTML).toContain('main');

      // Verify commit message input exists
      const input = dialog.querySelector('input#commit-message');
      expect(input).not.toBeNull();

      // Verify buttons exist
      const cancelButton = dialog.querySelector('#cancel-upload');
      const confirmButton = dialog.querySelector('#confirm-upload');
      expect(cancelButton).not.toBeNull();
      expect(confirmButton).not.toBeNull();
      expect(cancelButton?.textContent?.trim()).toBe('Cancel');
      expect(confirmButton?.textContent?.trim()).toBe('Upload');
    });
  });
});
