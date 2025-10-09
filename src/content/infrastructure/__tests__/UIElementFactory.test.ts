import type { ButtonOptions, DropdownItem } from '../../types/UITypes';
import { UIElementFactory } from '../UIElementFactory';

describe('UIElementFactory', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('createButton', () => {
    it('should create button with text content', () => {
      const options: ButtonOptions = {
        text: 'Click me',
      };

      const button = UIElementFactory.createButton(options);

      expect(button.tagName).toBe('BUTTON');
      expect(button.textContent).toBe('Click me');
    });

    it('should apply className when provided', () => {
      const options: ButtonOptions = {
        text: 'Button',
        className: 'btn btn-primary',
      };

      const button = UIElementFactory.createButton(options);

      expect(button.className).toBe('btn btn-primary');
    });

    it('should set disabled state', () => {
      const button = UIElementFactory.createButton({
        text: 'Button',
        disabled: true,
      });

      expect(button.disabled).toBe(true);
    });

    it('should set aria-label', () => {
      const button = UIElementFactory.createButton({
        text: 'Button',
        ariaLabel: 'Close dialog',
      });

      expect(button.getAttribute('aria-label')).toBe('Close dialog');
    });

    it('should set test id', () => {
      const button = UIElementFactory.createButton({
        text: 'Button',
        testId: 'submit-button',
      });

      expect(button.getAttribute('data-testid')).toBe('submit-button');
    });
  });

  describe('createGitHubButton', () => {
    it('should create GitHub button with default classes', () => {
      const button = UIElementFactory.createGitHubButton({
        text: 'GitHub Action',
      });

      expect(button.tagName).toBe('BUTTON');
      expect(button.textContent).toBe('GitHub Action');
      expect(button.className).toContain('rounded-md');
      expect(button.className).toContain('bg-bolt-elements-button-secondary-background');
    });

    it('should add custom classes', () => {
      const button = UIElementFactory.createGitHubButton({
        text: 'GitHub Action',
        className: 'custom-class',
      });

      expect(button.className).toContain('custom-class');
      expect(button.className).toContain('rounded-md');
    });

    it('should use innerHTML when provided', () => {
      const button = UIElementFactory.createGitHubButton({
        innerHTML: '<span>GitHub</span>',
      });

      expect(button.innerHTML).toBe('<span>GitHub</span>');
    });

    it('should prefer innerHTML over text', () => {
      const button = UIElementFactory.createGitHubButton({
        text: 'Text content',
        innerHTML: '<span>HTML content</span>',
      });

      expect(button.innerHTML).toBe('<span>HTML content</span>');
    });
  });

  describe('createDropdownContent', () => {
    it('should create dropdown with items', () => {
      const items: DropdownItem[] = [
        { label: 'Action 1', action: vi.fn(), icon: '<svg>icon</svg>' },
        { label: 'Action 2', action: vi.fn(), disabled: true },
      ];

      const dropdown = UIElementFactory.createDropdownContent(items);

      expect(dropdown.getAttribute('role')).toBe('menu');
      expect(dropdown.className).toContain('rounded-md');

      const buttons = dropdown.querySelectorAll('button');
      expect(buttons).toHaveLength(2);
      expect(buttons[0].innerHTML).toContain('Action 1');
      expect(buttons[1].disabled).toBe(true);
    });

    it('should call action when item clicked', async () => {
      const action = vi.fn();
      const dropdown = UIElementFactory.createDropdownContent([{ label: 'Test', action }]);

      const button = dropdown.querySelector('button');
      button!.click();

      await vi.waitFor(() => expect(action).toHaveBeenCalled());
    });

    it('should not call action when disabled', async () => {
      const action = vi.fn();
      const dropdown = UIElementFactory.createDropdownContent([
        { label: 'Test', action, disabled: true },
      ]);

      const button = dropdown.querySelector('button');
      button!.click();

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(action).not.toHaveBeenCalled();
    });
  });

  describe('createDialog', () => {
    it('should create dialog with title and content', () => {
      const dialog = UIElementFactory.createDialog({
        title: 'Test Dialog',
        content: 'Test content',
      });

      expect(dialog.tagName).toBe('DIV');
      expect(dialog.innerHTML).toContain('Test Dialog');
      expect(dialog.innerHTML).toContain('Test content');
      expect(dialog.style.zIndex).toBe('10000');
    });

    it('should create dialog with actions', () => {
      const dialog = UIElementFactory.createDialog({
        title: 'Confirm',
        content: 'Are you sure?',
        actions: {
          primary: { text: 'OK', action: vi.fn() },
          secondary: { text: 'Cancel', action: vi.fn() },
        },
      });

      expect(dialog.querySelector('[data-action="primary"]')).toBeTruthy();
      expect(dialog.querySelector('[data-action="secondary"]')).toBeTruthy();
      expect(dialog.innerHTML).toContain('OK');
      expect(dialog.innerHTML).toContain('Cancel');
    });

    it('should handle HTMLElement content', () => {
      const content = document.createElement('span');
      content.textContent = 'Custom';

      const dialog = UIElementFactory.createDialog({
        title: 'Dialog',
        content,
      });

      expect(dialog.textContent).toContain('Custom');
    });
  });

  describe('createOverlay', () => {
    it('should create overlay with defaults', () => {
      const overlay = UIElementFactory.createOverlay();

      expect(overlay.style.zIndex).toBe('9999');
      expect(overlay.style.backgroundColor).toBe('rgba(0, 0, 0, 0.5)');
      expect(overlay.className).toContain('fixed');
      expect(overlay.className).toContain('inset-0');
    });

    it('should apply custom config', () => {
      const overlay = UIElementFactory.createOverlay({
        zIndex: '12000',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        className: 'custom',
        styles: { backdropFilter: 'blur(5px)' },
      });

      expect(overlay.style.zIndex).toBe('12000');
      expect(overlay.className).toContain('custom');
      expect(overlay.style.backdropFilter).toBe('blur(5px)');
    });
  });

  describe('createContainer', () => {
    it('should create container with id', () => {
      const container = UIElementFactory.createContainer({ id: 'test' });

      expect(container.id).toBe('test');
    });

    it('should apply classes and styles', () => {
      const container = UIElementFactory.createContainer({
        id: 'test',
        className: ['class1', 'class2'],
        styles: { width: '100px' },
      });

      expect(container.className).toBe('class1 class2');
      expect(container.style.width).toBe('100px');
    });

    it('should set innerHTML', () => {
      const container = UIElementFactory.createContainer({
        id: 'test',
        innerHTML: '<span>Content</span>',
      });

      expect(container.innerHTML).toBe('<span>Content</span>');
    });

    it('should append to parent', () => {
      const parent = document.createElement('div');
      const container = UIElementFactory.createContainer({
        id: 'test',
        appendTo: parent,
      });

      expect(parent.contains(container)).toBe(true);
    });
  });

  describe('createNotification', () => {
    it('should create info notification', () => {
      const notification = UIElementFactory.createNotification('Test');

      expect(notification.className).toContain('bg-blue-500');
      expect(notification.textContent).toContain('Test');
    });

    it('should create error notification', () => {
      const notification = UIElementFactory.createNotification('Error', 'error');

      expect(notification.className).toContain('bg-red-500');
    });

    it('should create success notification', () => {
      const notification = UIElementFactory.createNotification('Success', 'success');

      expect(notification.className).toContain('bg-green-500');
    });
  });

  describe('createStyleElement', () => {
    it('should create style element', () => {
      const style = UIElementFactory.createStyleElement('test', 'body { margin: 0; }');

      expect(style.id).toBe('test');
      expect(style.textContent).toBe('body { margin: 0; }');
    });

    it('should return existing style element', () => {
      const existing = document.createElement('style');
      existing.id = 'existing';
      document.head.appendChild(existing);

      const style = UIElementFactory.createStyleElement('existing', 'new');

      expect(style).toBe(existing);
    });
  });

  describe('joinClasses', () => {
    it('should join string classes', () => {
      expect(UIElementFactory.joinClasses('a', 'b', 'c')).toBe('a b c');
    });

    it('should join array classes', () => {
      expect(UIElementFactory.joinClasses(['a', 'b'], 'c')).toBe('a b c');
    });

    it('should filter undefined', () => {
      expect(UIElementFactory.joinClasses('a', undefined, 'b')).toBe('a b');
    });

    it('should handle empty values', () => {
      expect(UIElementFactory.joinClasses('', [], 'valid')).toBe('valid');
    });
  });
});
