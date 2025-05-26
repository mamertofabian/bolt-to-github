import { UIElementFactory, type ContainerConfig, type OverlayConfig } from '../UIElementFactory';
import type { ButtonOptions, DropdownItem, DialogOptions } from '../../types/UITypes';

// Mock DOM environment using the same successful pattern as ComponentLifecycleManager
Object.defineProperty(global, 'document', {
  value: {
    createElement: jest.fn(),
    getElementById: jest.fn(),
    body: {
      appendChild: jest.fn(),
    },
    addEventListener: jest.fn(),
  },
  writable: true,
});

describe('UIElementFactory', () => {
  let mockElement: HTMLElement & { disabled?: boolean };
  let mockDocument: jest.Mocked<typeof document>;

  beforeEach(() => {
    // Setup mock document
    mockDocument = global.document as jest.Mocked<typeof document>;

    // Setup mock element (includes disabled for button elements)
    mockElement = {
      textContent: '',
      innerHTML: '',
      className: '',
      style: {},
      id: '',
      disabled: false,
      setAttribute: jest.fn(),
      appendChild: jest.fn(),
      addEventListener: jest.fn(),
      remove: jest.fn(),
      querySelector: jest.fn(),
    } as any;

    mockDocument.createElement.mockReturnValue(mockElement);
    mockDocument.getElementById.mockReturnValue(null);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('createButton', () => {
    it('should create button with text content', () => {
      const options: ButtonOptions = {
        text: 'Click me',
      };

      const button = UIElementFactory.createButton(options);

      expect(mockDocument.createElement).toHaveBeenCalledWith('button');
      expect(button).toBe(mockElement);
      expect(mockElement.textContent).toBe('Click me');
    });

    it('should apply className when provided', () => {
      const options: ButtonOptions = {
        text: 'Button',
        className: 'btn btn-primary',
      };

      UIElementFactory.createButton(options);

      expect(mockElement.className).toBe('btn btn-primary');
    });

    it('should set disabled state when provided', () => {
      const options: ButtonOptions = {
        text: 'Button',
        disabled: true,
      };

      UIElementFactory.createButton(options);

      expect(mockElement.disabled).toBe(true);
    });

    it('should set aria-label when provided', () => {
      const options: ButtonOptions = {
        text: 'Button',
        ariaLabel: 'Close dialog',
      };

      UIElementFactory.createButton(options);

      expect(mockElement.setAttribute).toHaveBeenCalledWith('aria-label', 'Close dialog');
    });

    it('should set test id when provided', () => {
      const options: ButtonOptions = {
        text: 'Button',
        testId: 'submit-button',
      };

      UIElementFactory.createButton(options);

      expect(mockElement.setAttribute).toHaveBeenCalledWith('data-testid', 'submit-button');
    });

    it('should create button with all options', () => {
      const options: ButtonOptions = {
        text: 'Complete Button',
        className: 'btn btn-success',
        disabled: false,
        ariaLabel: 'Complete action',
        testId: 'complete-btn',
      };

      UIElementFactory.createButton(options);

      expect(mockElement.textContent).toBe('Complete Button');
      expect(mockElement.className).toBe('btn btn-success');
      expect(mockElement.disabled).toBe(false);
      expect(mockElement.setAttribute).toHaveBeenCalledWith('aria-label', 'Complete action');
      expect(mockElement.setAttribute).toHaveBeenCalledWith('data-testid', 'complete-btn');
    });
  });

  describe('createGitHubButton', () => {
    it('should create GitHub button with default classes', () => {
      const options = {
        text: 'GitHub Action',
      };

      const button = UIElementFactory.createGitHubButton(options);

      expect(mockDocument.createElement).toHaveBeenCalledWith('button');
      expect(button).toBe(mockElement);
      expect(mockElement.textContent).toBe('GitHub Action');

      const expectedClasses = [
        'rounded-md',
        'items-center',
        'justify-center',
        'outline-accent-600',
        'px-3',
        'py-1.25',
        'disabled:cursor-not-allowed',
        'text-xs',
        'bg-bolt-elements-button-secondary-background',
        'text-bolt-elements-button-secondary-text',
        'enabled:hover:bg-bolt-elements-button-secondary-backgroundHover',
        'flex',
        'gap-1.7',
        'transition-opacity',
      ].join(' ');

      expect(mockElement.className).toBe(expectedClasses);
    });

    it('should create GitHub button with additional classes', () => {
      const options = {
        text: 'GitHub Action',
        className: 'custom-class',
      };

      UIElementFactory.createGitHubButton(options);

      expect(mockElement.className).toContain('custom-class');
      expect(mockElement.className).toContain('rounded-md');
    });

    it('should create GitHub button with innerHTML when provided', () => {
      const options = {
        innerHTML: '<span>GitHub</span>',
      };

      UIElementFactory.createGitHubButton(options);

      expect(mockElement.innerHTML).toBe('<span>GitHub</span>');
      expect(mockElement.textContent).toBe('');
    });

    it('should prefer innerHTML over text when both provided', () => {
      const options = {
        text: 'Text content',
        innerHTML: '<span>HTML content</span>',
      };

      UIElementFactory.createGitHubButton(options);

      expect(mockElement.innerHTML).toBe('<span>HTML content</span>');
      expect(mockElement.textContent).toBe('');
    });

    it('should set disabled state', () => {
      const options = {
        text: 'Button',
        disabled: true,
      };

      UIElementFactory.createGitHubButton(options);

      expect(mockElement.disabled).toBe(true);
    });

    it('should set aria-label and test id', () => {
      const options = {
        text: 'Button',
        ariaLabel: 'GitHub action',
        testId: 'github-btn',
      };

      UIElementFactory.createGitHubButton(options);

      expect(mockElement.setAttribute).toHaveBeenCalledWith('aria-label', 'GitHub action');
      expect(mockElement.setAttribute).toHaveBeenCalledWith('data-testid', 'github-btn');
    });
  });

  describe('createDropdownContent', () => {
    it('should create dropdown with multiple items', () => {
      const mockItem1 = {
        addEventListener: jest.fn(),
        disabled: false,
        className: '',
        innerHTML: '',
      } as any;
      const mockItem2 = {
        addEventListener: jest.fn(),
        disabled: false,
        className: '',
        innerHTML: '',
      } as any;

      (mockDocument.createElement as jest.Mock)
        .mockReturnValueOnce(mockElement) // Main dropdown container
        .mockReturnValueOnce(mockItem1) // First item
        .mockReturnValueOnce(mockItem2); // Second item

      const items: DropdownItem[] = [
        {
          label: 'Action 1',
          action: jest.fn(),
          icon: '<svg>icon1</svg>',
        },
        {
          label: 'Action 2',
          action: jest.fn(),
          disabled: true,
        },
      ];

      const dropdown = UIElementFactory.createDropdownContent(items);

      expect(mockDocument.createElement).toHaveBeenCalledWith('div');
      expect(mockDocument.createElement).toHaveBeenCalledWith('button');
      expect(dropdown).toBe(mockElement);
      expect(mockElement.setAttribute).toHaveBeenCalledWith('role', 'menu');
      expect(mockElement.className).toBe(
        'rounded-md shadow-lg overflow-hidden min-w-[180px] animate-fadeIn'
      );
      expect(mockElement.appendChild).toHaveBeenCalledTimes(2);
    });

    it('should create dropdown with id when provided', () => {
      const items: DropdownItem[] = [];

      UIElementFactory.createDropdownContent(items, 'dropdown-123');

      expect(mockElement.id).toBe('dropdown-123');
    });

    it('should set up item click handlers', () => {
      const mockItem = {
        addEventListener: jest.fn(),
        disabled: false,
        className: '',
        innerHTML: '',
      } as any;

      (mockDocument.createElement as jest.Mock)
        .mockReturnValueOnce(mockElement)
        .mockReturnValueOnce(mockItem);

      const actionMock = jest.fn();
      const items: DropdownItem[] = [
        {
          label: 'Test Action',
          action: actionMock,
        },
      ];

      UIElementFactory.createDropdownContent(items);

      expect(mockItem.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
      expect(mockItem.className).toBe('dropdown-item flex items-center');
      expect(mockItem.innerHTML).toBe('\n        \n        <span>Test Action</span>\n      ');
    });

    it('should handle disabled items', () => {
      const mockItem = {
        addEventListener: jest.fn(),
        disabled: false,
        className: '',
        innerHTML: '',
      } as any;

      (mockDocument.createElement as jest.Mock)
        .mockReturnValueOnce(mockElement)
        .mockReturnValueOnce(mockItem);

      const items: DropdownItem[] = [
        {
          label: 'Disabled Action',
          action: jest.fn(),
          disabled: true,
        },
      ];

      UIElementFactory.createDropdownContent(items);

      expect(mockItem.disabled).toBe(true);
    });

    it('should include icons in items when provided', () => {
      const mockItem = {
        addEventListener: jest.fn(),
        disabled: false,
        className: '',
        innerHTML: '',
      } as any;

      (mockDocument.createElement as jest.Mock)
        .mockReturnValueOnce(mockElement)
        .mockReturnValueOnce(mockItem);

      const items: DropdownItem[] = [
        {
          label: 'With Icon',
          action: jest.fn(),
          icon: '<svg>icon</svg>',
        },
      ];

      UIElementFactory.createDropdownContent(items);

      expect(mockItem.innerHTML).toBe(
        '\n        <svg>icon</svg>\n        <span>With Icon</span>\n      '
      );
    });
  });

  describe('createDialog', () => {
    it('should create dialog with title and string content', () => {
      const options: DialogOptions = {
        title: 'Test Dialog',
        content: 'This is the dialog content.',
      };

      const dialog = UIElementFactory.createDialog(options);

      expect(mockDocument.createElement).toHaveBeenCalledWith('div');
      expect(dialog).toBe(mockElement);
      expect(mockElement.style.zIndex).toBe('10000');
      expect(mockElement.style.width).toBe('320px');
      expect(mockElement.style.backgroundColor).toBe('#0f172a');
      expect(mockElement.className).toBe(
        'p-6 rounded-lg shadow-xl mx-4 space-y-4 border border-slate-700 relative'
      );

      const expectedHTML =
        '<h3 class="text-lg font-semibold text-white">Test Dialog</h3><p class="text-slate-300 text-sm">This is the dialog content.</p>';
      expect(mockElement.innerHTML).toBe(expectedHTML);
    });

    it('should create dialog with actions', () => {
      const primaryAction = jest.fn();
      const secondaryAction = jest.fn();

      const options: DialogOptions = {
        title: 'Confirm Action',
        content: 'Are you sure?',
        actions: {
          primary: { text: 'Confirm', action: primaryAction },
          secondary: { text: 'Cancel', action: secondaryAction },
        },
      };

      UIElementFactory.createDialog(options);

      // Check that the HTML contains the expected elements (ignore whitespace formatting)
      expect(mockElement.innerHTML).toContain(
        '<h3 class="text-lg font-semibold text-white">Confirm Action</h3>'
      );
      expect(mockElement.innerHTML).toContain(
        '<p class="text-slate-300 text-sm">Are you sure?</p>'
      );
      expect(mockElement.innerHTML).toContain('data-action="primary"');
      expect(mockElement.innerHTML).toContain('data-action="secondary"');
      expect(mockElement.innerHTML).toContain('Confirm');
      expect(mockElement.innerHTML).toContain('Cancel');
      expect(mockElement.innerHTML).toContain('bg-blue-600');
      expect(mockElement.innerHTML).toContain('bg-slate-800');
    });

    it('should create dialog with only primary action', () => {
      const options: DialogOptions = {
        title: 'Alert',
        content: 'Something happened.',
        actions: {
          primary: { text: 'OK', action: jest.fn() },
        },
      };

      UIElementFactory.createDialog(options);

      expect(mockElement.innerHTML).toContain('OK');
      expect(mockElement.innerHTML).not.toContain('Cancel');
    });

    it('should create dialog with only secondary action', () => {
      const options: DialogOptions = {
        title: 'Info',
        content: 'Information message.',
        actions: {
          secondary: { text: 'Close', action: jest.fn() },
        },
      };

      UIElementFactory.createDialog(options);

      expect(mockElement.innerHTML).toContain('Close');
      expect(mockElement.innerHTML).toContain('bg-slate-800');
    });

    it('should handle HTMLElement content', () => {
      const mockContentElement = {
        tagName: 'SPAN',
        textContent: 'Custom content',
      } as any;

      mockElement.querySelector = jest.fn().mockReturnValue(mockElement);

      const options: DialogOptions = {
        title: 'Custom Dialog',
        content: mockContentElement,
      };

      UIElementFactory.createDialog(options);

      expect(mockElement.appendChild).toHaveBeenCalledWith(mockContentElement);
    });
  });

  describe('createOverlay', () => {
    it('should create overlay with default settings', () => {
      const overlay = UIElementFactory.createOverlay();

      expect(mockDocument.createElement).toHaveBeenCalledWith('div');
      expect(overlay).toBe(mockElement);
      expect(mockElement.style.zIndex).toBe('9999');
      expect(mockElement.style.backgroundColor).toBe('rgba(0, 0, 0, 0.5)');
      expect(mockElement.className).toBe('fixed inset-0 flex items-center justify-center');
    });

    it('should create overlay with custom config', () => {
      const config: OverlayConfig = {
        zIndex: '12000',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        className: ['custom-overlay'],
        styles: {
          backdropFilter: 'blur(5px)',
        },
      };

      UIElementFactory.createOverlay(config);

      expect(mockElement.style.zIndex).toBe('12000');
      expect(mockElement.style.backgroundColor).toBe('rgba(255, 255, 255, 0.8)');
      expect(mockElement.className).toBe(
        'fixed inset-0 flex items-center justify-center custom-overlay'
      );
      expect(mockElement.style.backdropFilter).toBe('blur(5px)');
    });

    it('should handle string className', () => {
      const config: OverlayConfig = {
        className: 'modal-overlay',
      };

      UIElementFactory.createOverlay(config);

      expect(mockElement.className).toBe(
        'fixed inset-0 flex items-center justify-center modal-overlay'
      );
    });

    it('should handle array className', () => {
      const config: OverlayConfig = {
        className: ['overlay-class-1', 'overlay-class-2'],
      };

      UIElementFactory.createOverlay(config);

      expect(mockElement.className).toBe(
        'fixed inset-0 flex items-center justify-center overlay-class-1 overlay-class-2'
      );
    });
  });

  describe('createContainer', () => {
    const mockParentElement = {
      appendChild: jest.fn(),
    } as any;

    beforeEach(() => {
      mockParentElement.appendChild.mockClear();
    });

    it('should create container with basic config', () => {
      const config: ContainerConfig = {
        id: 'test-container',
      };

      const container = UIElementFactory.createContainer(config);

      expect(mockDocument.createElement).toHaveBeenCalledWith('div');
      expect(container).toBe(mockElement);
      expect(mockElement.id).toBe('test-container');
    });

    it('should apply string className', () => {
      const config: ContainerConfig = {
        id: 'test-container',
        className: 'container-class',
      };

      UIElementFactory.createContainer(config);

      expect(mockElement.className).toBe('container-class');
    });

    it('should apply array className', () => {
      const config: ContainerConfig = {
        id: 'test-container',
        className: ['class1', 'class2', 'class3'],
      };

      UIElementFactory.createContainer(config);

      expect(mockElement.className).toBe('class1 class2 class3');
    });

    it('should apply styles', () => {
      const config: ContainerConfig = {
        id: 'test-container',
        styles: {
          width: '100px',
          height: '200px',
          backgroundColor: 'red',
        },
      };

      UIElementFactory.createContainer(config);

      expect(mockElement.style).toEqual(
        expect.objectContaining({
          width: '100px',
          height: '200px',
          backgroundColor: 'red',
        })
      );
    });

    it('should set innerHTML', () => {
      const config: ContainerConfig = {
        id: 'test-container',
        innerHTML: '<span>Inner content</span>',
      };

      UIElementFactory.createContainer(config);

      expect(mockElement.innerHTML).toBe('<span>Inner content</span>');
    });

    it('should append to parent element', () => {
      const config: ContainerConfig = {
        id: 'test-container',
        appendTo: mockParentElement,
      };

      UIElementFactory.createContainer(config);

      expect(mockParentElement.appendChild).toHaveBeenCalledWith(mockElement);
    });

    it('should create container with all options', () => {
      const config: ContainerConfig = {
        id: 'full-container',
        className: ['container', 'main'],
        styles: { padding: '10px' },
        innerHTML: '<p>Content</p>',
        appendTo: mockParentElement,
      };

      UIElementFactory.createContainer(config);

      expect(mockElement.id).toBe('full-container');
      expect(mockElement.className).toBe('container main');
      expect(mockElement.style.padding).toBe('10px');
      expect(mockElement.innerHTML).toBe('<p>Content</p>');
      expect(mockParentElement.appendChild).toHaveBeenCalledWith(mockElement);
    });
  });

  describe('createNotification', () => {
    it('should create info notification by default', () => {
      const notification = UIElementFactory.createNotification('Test message');

      expect(mockDocument.createElement).toHaveBeenCalledWith('div');
      expect(notification).toBe(mockElement);
      expect(mockElement.style.zIndex).toBe('10000');
      expect(mockElement.className).toContain('bg-blue-500');
      expect(mockElement.innerHTML).toContain('Test message');
      expect(mockElement.innerHTML).toContain('<svg width="20" height="20"');
    });

    it('should create error notification', () => {
      UIElementFactory.createNotification('Error message', 'error');

      expect(mockElement.className).toContain('bg-red-500');
      expect(mockElement.innerHTML).toContain('Error message');
      expect(mockElement.innerHTML).toContain('<line x1="12" y1="8" x2="12" y2="12"></line>');
    });

    it('should create success notification', () => {
      UIElementFactory.createNotification('Success message', 'success');

      expect(mockElement.className).toContain('bg-green-500');
      expect(mockElement.innerHTML).toContain('Success message');
      expect(mockElement.innerHTML).toContain('<path d="m9 12 2 2 4-4"></path>');
    });

    it('should apply correct CSS classes', () => {
      UIElementFactory.createNotification('Test');

      const expectedClasses = [
        'fixed',
        'top-4',
        'right-4',
        'p-4',
        'bg-blue-500',
        'text-white',
        'rounded-md',
        'shadow-lg',
        'flex',
        'items-center',
        'gap-2',
        'text-sm',
      ].join(' ');

      expect(mockElement.className).toBe(expectedClasses);
    });
  });

  describe('createStyleElement', () => {
    const mockStyleElement = {
      id: '',
      textContent: '',
      tagName: 'STYLE',
    } as any;

    const mockExistingElement = {
      id: 'existing-style',
      tagName: 'STYLE',
    } as any;

    beforeEach(() => {
      mockDocument.createElement.mockReturnValue(mockStyleElement);
      mockDocument.getElementById = jest.fn();
    });

    it('should create new style element', () => {
      mockDocument.getElementById.mockReturnValue(null);

      const style = UIElementFactory.createStyleElement('test-styles', 'body { margin: 0; }');

      expect(mockDocument.createElement).toHaveBeenCalledWith('style');
      expect(style).toBe(mockStyleElement);
      expect(mockStyleElement.id).toBe('test-styles');
      expect(mockStyleElement.textContent).toBe('body { margin: 0; }');
    });

    it('should return existing style element if it exists', () => {
      mockDocument.getElementById.mockReturnValue(mockExistingElement);

      const style = UIElementFactory.createStyleElement('existing-style', 'new styles');

      expect(mockDocument.createElement).not.toHaveBeenCalled();
      expect(style).toBe(mockExistingElement);
    });
  });

  describe('joinClasses', () => {
    it('should join multiple string classes', () => {
      const result = UIElementFactory.joinClasses('class1', 'class2', 'class3');

      expect(result).toBe('class1 class2 class3');
    });

    it('should join array classes', () => {
      const result = UIElementFactory.joinClasses(['array1', 'array2'], 'string1');

      expect(result).toBe('array1 array2 string1');
    });

    it('should filter out undefined values', () => {
      const result = UIElementFactory.joinClasses('class1', undefined, 'class2', undefined);

      expect(result).toBe('class1 class2');
    });

    it('should handle empty arrays and strings', () => {
      const result = UIElementFactory.joinClasses('', [], 'valid-class', []);

      expect(result).toBe('valid-class');
    });

    it('should handle mixed types', () => {
      const result = UIElementFactory.joinClasses(
        'string-class',
        ['array-class1', 'array-class2'],
        undefined,
        'another-string',
        []
      );

      expect(result).toBe('string-class array-class1 array-class2 another-string');
    });

    it('should return empty string for no valid classes', () => {
      const result = UIElementFactory.joinClasses(undefined, [], '', undefined);

      expect(result).toBe('');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty dropdown items array', () => {
      const dropdown = UIElementFactory.createDropdownContent([]);

      expect(dropdown).toBe(mockElement);
      expect(mockElement.appendChild).not.toHaveBeenCalled();
    });

    it('should handle undefined button options gracefully', () => {
      const options = {
        text: 'Button',
        className: undefined,
        disabled: undefined,
        ariaLabel: undefined,
        testId: undefined,
      };

      UIElementFactory.createButton(options);

      expect(mockElement.textContent).toBe('Button');
      // Should not call setAttribute for undefined values
      expect(mockElement.setAttribute).not.toHaveBeenCalled();
    });

    it('should handle empty overlay config', () => {
      const overlay = UIElementFactory.createOverlay({});

      expect(overlay).toBe(mockElement);
      expect(mockElement.className).toBe('fixed inset-0 flex items-center justify-center');
    });
  });
});
