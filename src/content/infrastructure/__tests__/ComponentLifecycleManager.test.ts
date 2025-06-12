import { ComponentLifecycleManager, type ComponentConfig } from '../ComponentLifecycleManager';
import type { SvelteComponent } from '../../types/UITypes';

// Mock Svelte component constructor
class MockSvelteComponent implements SvelteComponent {
  public target: HTMLElement;
  public props: Record<string, any>;
  public $setCallCount = 0;
  public $destroyCallCount = 0;

  constructor({ target, props }: { target: HTMLElement; props?: Record<string, any> }) {
    this.target = target;
    this.props = props || {};
  }

  $set(newProps: Record<string, any>): void {
    this.props = { ...this.props, ...newProps };
    this.$setCallCount++;
  }

  $destroy(): void {
    this.$destroyCallCount++;
  }
}

// Mock DOM environment
Object.defineProperty(global, 'document', {
  value: {
    createElement: jest.fn(),
    getElementById: jest.fn(),
    body: null,
    addEventListener: jest.fn(),
  },
  writable: true,
});

const mockConsole = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

// Replace console methods for testing
Object.defineProperty(global, 'console', {
  value: mockConsole,
  writable: true,
});

describe('ComponentLifecycleManager', () => {
  let lifecycleManager: ComponentLifecycleManager;
  let mockDocument: jest.Mocked<typeof document>;
  let mockElement: HTMLElement;

  const createBasicConfig = (): ComponentConfig => ({
    constructor: MockSvelteComponent,
    containerId: 'test-container',
  });

  beforeEach(() => {
    lifecycleManager = new ComponentLifecycleManager();

    // Reset all mocks
    jest.clearAllMocks();
    mockConsole.log.mockClear();
    mockConsole.error.mockClear();
    mockConsole.warn.mockClear();

    // Setup mock document
    mockDocument = global.document as jest.Mocked<typeof document>;

    // Setup mock element
    mockElement = {
      id: '',
      className: '',
      style: {},
      remove: jest.fn(),
      appendChild: jest.fn(),
      parentNode: {
        removeChild: jest.fn(),
      },
    } as any;

    mockDocument.createElement.mockReturnValue(mockElement);
    mockDocument.getElementById.mockReturnValue(null);

    // Setup mock document.body
    Object.defineProperty(global.document, 'body', {
      value: {
        appendChild: jest.fn(),
      },
      writable: true,
    });
  });

  describe('Constructor', () => {
    it('should initialize with empty component and container maps', () => {
      expect(lifecycleManager.getActiveComponentIds()).toEqual([]);
      expect(lifecycleManager.hasComponent('test')).toBe(false);
    });
  });

  describe('createComponent', () => {
    it('should create and mount a component successfully', async () => {
      const config = createBasicConfig();

      const component = await lifecycleManager.createComponent<MockSvelteComponent>(
        'test-component',
        config
      );

      expect(component).toBeInstanceOf(MockSvelteComponent);
      expect(component.target).toBe(mockElement);
      expect(lifecycleManager.hasComponent('test-component')).toBe(true);
      expect(lifecycleManager.getComponent('test-component')).toBe(component);
      expect(mockConsole.log).toHaveBeenCalledWith(
        "🔊 Component 'test-component' created successfully"
      );
    });

    it('should create container with correct id', async () => {
      const config = createBasicConfig();

      await lifecycleManager.createComponent('test-component', config);

      expect(mockDocument.createElement).toHaveBeenCalledWith('div');
      expect(mockElement.id).toBe('test-container');
    });

    it('should apply container classes when provided', async () => {
      const config: ComponentConfig = {
        ...createBasicConfig(),
        containerClasses: ['class1', 'class2'],
      };

      await lifecycleManager.createComponent('test-component', config);

      expect(mockElement.className).toBe('class1 class2');
    });

    it('should apply container styles when provided', async () => {
      const config: ComponentConfig = {
        ...createBasicConfig(),
        containerStyles: {
          width: '100px',
          height: '200px',
        },
      };

      await lifecycleManager.createComponent('test-component', config);

      expect(mockElement.style).toEqual(
        expect.objectContaining({
          width: '100px',
          height: '200px',
        })
      );
    });

    it('should pass props to component constructor', async () => {
      const config: ComponentConfig = {
        ...createBasicConfig(),
        props: { testProp: 'testValue', count: 42 },
      };

      const component = await lifecycleManager.createComponent<MockSvelteComponent>(
        'test-component',
        config
      );

      expect(component.props).toEqual({ testProp: 'testValue', count: 42 });
    });

    it('should append container to document.body by default', async () => {
      const config = createBasicConfig();

      await lifecycleManager.createComponent('test-component', config);

      expect(document.body?.appendChild).toHaveBeenCalledWith(mockElement);
    });

    it('should not append to body when appendToBody is false', async () => {
      const config: ComponentConfig = {
        ...createBasicConfig(),
        appendToBody: false,
      };

      await lifecycleManager.createComponent('test-component', config);

      expect(document.body?.appendChild).not.toHaveBeenCalled();
    });

    it('should warn when document.body is not available and appendToBody is true', async () => {
      // Remove document.body
      Object.defineProperty(global.document, 'body', {
        value: null,
        writable: true,
      });

      const config = createBasicConfig();

      await lifecycleManager.createComponent('test-component', config);

      expect(mockConsole.warn).toHaveBeenCalledWith(
        "Cannot append container 'test-container' - document.body not available"
      );
    });

    it('should remove existing container with same id before creating new one', async () => {
      const existingElement = {
        remove: jest.fn(),
      } as any;

      mockDocument.getElementById.mockReturnValue(existingElement);

      const config = createBasicConfig();

      await lifecycleManager.createComponent('test-component', config);

      expect(existingElement.remove).toHaveBeenCalled();
    });

    it('should clean up existing component with same id before creating new one', async () => {
      const config = createBasicConfig();

      // Create first component
      const firstComponent = await lifecycleManager.createComponent<MockSvelteComponent>(
        'test-component',
        config
      );

      // Create second component with same id
      const secondComponent = await lifecycleManager.createComponent<MockSvelteComponent>(
        'test-component',
        config
      );

      expect(firstComponent.$destroyCallCount).toBe(1);
      expect(lifecycleManager.getComponent('test-component')).toBe(secondComponent);
    });

    it('should wait for DOMContentLoaded when waitForBody is true and body is not available', async () => {
      // Remove document.body
      Object.defineProperty(global.document, 'body', {
        value: null,
        writable: true,
      });

      const config: ComponentConfig = {
        ...createBasicConfig(),
        waitForBody: true,
      };

      const createPromise = lifecycleManager.createComponent('test-component', config);

      // Component should not be created yet
      expect(lifecycleManager.hasComponent('test-component')).toBe(false);
      expect(mockConsole.log).toHaveBeenCalledWith(
        "Waiting for body to be available for component 'test-component'"
      );
      expect(mockDocument.addEventListener).toHaveBeenCalledWith(
        'DOMContentLoaded',
        expect.any(Function)
      );

      // Simulate DOMContentLoaded event
      const eventListener = (mockDocument.addEventListener as jest.Mock).mock.calls[0][1];

      // Restore document.body before triggering event
      Object.defineProperty(global.document, 'body', {
        value: { appendChild: jest.fn() },
        writable: true,
      });

      eventListener();

      const component = await createPromise;
      expect(component).toBeInstanceOf(MockSvelteComponent);
      expect(lifecycleManager.hasComponent('test-component')).toBe(true);
    });

    it('should handle constructor errors gracefully', async () => {
      const FailingComponent = class {
        constructor() {
          throw new Error('Component constructor failed');
        }
      };

      const config: ComponentConfig = {
        constructor: FailingComponent,
        containerId: 'test-container',
      };

      await expect(lifecycleManager.createComponent('test-component', config)).rejects.toThrow(
        'Component constructor failed'
      );
      expect(mockConsole.error).toHaveBeenCalledWith(
        "🔊 Error creating component 'test-component':",
        expect.any(Error)
      );
    });

    it('should handle unexpected errors during component creation', async () => {
      // Make createElement throw an error
      mockDocument.createElement.mockImplementation(() => {
        throw new Error('createElement failed');
      });

      const config = createBasicConfig();

      await expect(lifecycleManager.createComponent('test-component', config)).rejects.toThrow(
        'createElement failed'
      );
    });
  });

  describe('updateComponent', () => {
    it('should update component props when component exists and supports $set', async () => {
      const config = createBasicConfig();
      const component = await lifecycleManager.createComponent<MockSvelteComponent>(
        'test-component',
        config
      );

      lifecycleManager.updateComponent('test-component', { newProp: 'newValue' });

      expect(component.$setCallCount).toBe(1);
      expect(component.props).toEqual({ newProp: 'newValue' });
    });

    it('should warn when component does not exist', () => {
      lifecycleManager.updateComponent('non-existent', { test: 'value' });

      expect(mockConsole.warn).toHaveBeenCalledWith(
        "Component 'non-existent' not found or doesn't support $set"
      );
    });

    it('should warn when component does not support $set', async () => {
      const ComponentWithoutSet = class {
        constructor({ target }: { target: HTMLElement }) {
          // Component without $set method
        }
      };

      const config: ComponentConfig = {
        constructor: ComponentWithoutSet,
        containerId: 'test-container',
      };

      await lifecycleManager.createComponent('test-component', config);

      lifecycleManager.updateComponent('test-component', { test: 'value' });

      expect(mockConsole.warn).toHaveBeenCalledWith(
        "Component 'test-component' not found or doesn't support $set"
      );
    });
  });

  describe('destroyComponent', () => {
    it('should destroy component and remove container when both exist', async () => {
      const config = createBasicConfig();
      const component = await lifecycleManager.createComponent<MockSvelteComponent>(
        'test-component',
        config
      );

      lifecycleManager.destroyComponent('test-component');

      expect(component.$destroyCallCount).toBe(1);
      expect(lifecycleManager.hasComponent('test-component')).toBe(false);
      expect(lifecycleManager.getComponent('test-component')).toBeNull();
      expect(mockElement.parentNode?.removeChild).toHaveBeenCalledWith(mockElement);
      expect(mockConsole.log).toHaveBeenCalledWith("🔊 Component 'test-component' destroyed");
      expect(mockConsole.log).toHaveBeenCalledWith(
        "🔊 Container for component 'test-component' removed"
      );
    });

    it('should handle destroying non-existent component gracefully', () => {
      lifecycleManager.destroyComponent('non-existent');

      // Should not throw or log any errors
      expect(mockConsole.error).not.toHaveBeenCalled();
    });

    it('should handle component without $destroy method gracefully', async () => {
      const ComponentWithoutDestroy = class {
        constructor({ target }: { target: HTMLElement }) {
          // Component without $destroy method
        }
      };

      const config: ComponentConfig = {
        constructor: ComponentWithoutDestroy,
        containerId: 'test-container',
      };

      await lifecycleManager.createComponent('test-component', config);

      lifecycleManager.destroyComponent('test-component');

      expect(lifecycleManager.hasComponent('test-component')).toBe(false);
    });

    it('should handle container without parent node gracefully', async () => {
      const config = createBasicConfig();
      await lifecycleManager.createComponent('test-component', config);

      // Remove parent node
      Object.defineProperty(mockElement, 'parentNode', {
        value: null,
        writable: true,
      });

      lifecycleManager.destroyComponent('test-component');

      expect(lifecycleManager.hasComponent('test-component')).toBe(false);
      // Should not call removeChild when parent doesn't exist
    });
  });

  describe('getComponent', () => {
    it('should return component when it exists', async () => {
      const config = createBasicConfig();
      const component = await lifecycleManager.createComponent<MockSvelteComponent>(
        'test-component',
        config
      );

      const retrieved = lifecycleManager.getComponent<MockSvelteComponent>('test-component');

      expect(retrieved).toBe(component);
    });

    it('should return null when component does not exist', () => {
      const retrieved = lifecycleManager.getComponent('non-existent');

      expect(retrieved).toBeNull();
    });
  });

  describe('getContainer', () => {
    it('should return container when it exists', async () => {
      const config = createBasicConfig();
      await lifecycleManager.createComponent('test-component', config);

      const container = lifecycleManager.getContainer('test-component');

      expect(container).toBe(mockElement);
    });

    it('should return null when container does not exist', () => {
      const container = lifecycleManager.getContainer('non-existent');

      expect(container).toBeNull();
    });
  });

  describe('hasComponent', () => {
    it('should return true when component exists', async () => {
      const config = createBasicConfig();
      await lifecycleManager.createComponent('test-component', config);

      expect(lifecycleManager.hasComponent('test-component')).toBe(true);
    });

    it('should return false when component does not exist', () => {
      expect(lifecycleManager.hasComponent('non-existent')).toBe(false);
    });
  });

  describe('getActiveComponentIds', () => {
    it('should return empty array when no components exist', () => {
      expect(lifecycleManager.getActiveComponentIds()).toEqual([]);
    });

    it('should return array of active component ids', async () => {
      const config = createBasicConfig();

      await lifecycleManager.createComponent('component-1', {
        ...config,
        containerId: 'container-1',
      });
      await lifecycleManager.createComponent('component-2', {
        ...config,
        containerId: 'container-2',
      });

      const activeIds = lifecycleManager.getActiveComponentIds();

      expect(activeIds).toEqual(['component-1', 'component-2']);
    });

    it('should not include destroyed components', async () => {
      const config = createBasicConfig();

      await lifecycleManager.createComponent('component-1', {
        ...config,
        containerId: 'container-1',
      });
      await lifecycleManager.createComponent('component-2', {
        ...config,
        containerId: 'container-2',
      });

      lifecycleManager.destroyComponent('component-1');

      const activeIds = lifecycleManager.getActiveComponentIds();

      expect(activeIds).toEqual(['component-2']);
    });
  });

  describe('cleanupAll', () => {
    it('should destroy all components and clear all maps', async () => {
      const config = createBasicConfig();

      const component1 = await lifecycleManager.createComponent<MockSvelteComponent>(
        'component-1',
        { ...config, containerId: 'container-1' }
      );
      const component2 = await lifecycleManager.createComponent<MockSvelteComponent>(
        'component-2',
        { ...config, containerId: 'container-2' }
      );

      lifecycleManager.cleanupAll();

      expect(component1.$destroyCallCount).toBe(1);
      expect(component2.$destroyCallCount).toBe(1);
      expect(lifecycleManager.getActiveComponentIds()).toEqual([]);
      expect(lifecycleManager.hasComponent('component-1')).toBe(false);
      expect(lifecycleManager.hasComponent('component-2')).toBe(false);
      expect(mockConsole.log).toHaveBeenCalledWith('🔊 Cleaning up all components');
    });

    it('should handle cleanup when no components exist', () => {
      lifecycleManager.cleanupAll();

      expect(lifecycleManager.getActiveComponentIds()).toEqual([]);
      expect(mockConsole.log).toHaveBeenCalledWith('🔊 Cleaning up all components');
    });
  });

  describe('cleanupByPattern', () => {
    it('should destroy only components matching the pattern', async () => {
      const config = createBasicConfig();

      const modalComponent1 = await lifecycleManager.createComponent<MockSvelteComponent>(
        'modal-component-1',
        { ...config, containerId: 'modal-1' }
      );
      const modalComponent2 = await lifecycleManager.createComponent<MockSvelteComponent>(
        'modal-component-2',
        { ...config, containerId: 'modal-2' }
      );
      const buttonComponent = await lifecycleManager.createComponent<MockSvelteComponent>(
        'button-component',
        { ...config, containerId: 'button-1' }
      );

      const modalPattern = /^modal-/;
      lifecycleManager.cleanupByPattern(modalPattern);

      expect(modalComponent1.$destroyCallCount).toBe(1);
      expect(modalComponent2.$destroyCallCount).toBe(1);
      expect(buttonComponent.$destroyCallCount).toBe(0);
      expect(lifecycleManager.hasComponent('modal-component-1')).toBe(false);
      expect(lifecycleManager.hasComponent('modal-component-2')).toBe(false);
      expect(lifecycleManager.hasComponent('button-component')).toBe(true);
    });

    it('should handle pattern that matches no components', async () => {
      const config = createBasicConfig();
      await lifecycleManager.createComponent('test-component', config);

      const pattern = /^non-matching-/;
      lifecycleManager.cleanupByPattern(pattern);

      expect(lifecycleManager.hasComponent('test-component')).toBe(true);
      expect(lifecycleManager.getActiveComponentIds()).toEqual(['test-component']);
    });

    it('should handle cleanup by pattern when no components exist', () => {
      const pattern = /^modal-/;

      expect(() => lifecycleManager.cleanupByPattern(pattern)).not.toThrow();
      expect(lifecycleManager.getActiveComponentIds()).toEqual([]);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle multiple component lifecycle operations', async () => {
      const config = createBasicConfig();

      // Create components
      const component1 = await lifecycleManager.createComponent<MockSvelteComponent>('comp-1', {
        ...config,
        containerId: 'container-1',
      });
      const component2 = await lifecycleManager.createComponent<MockSvelteComponent>('comp-2', {
        ...config,
        containerId: 'container-2',
      });

      // Update components
      lifecycleManager.updateComponent('comp-1', { updated: true });
      lifecycleManager.updateComponent('comp-2', { count: 5 });

      expect(component1.props).toEqual({ updated: true });
      expect(component2.props).toEqual({ count: 5 });

      // Destroy one component
      lifecycleManager.destroyComponent('comp-1');

      expect(lifecycleManager.hasComponent('comp-1')).toBe(false);
      expect(lifecycleManager.hasComponent('comp-2')).toBe(true);
      expect(lifecycleManager.getActiveComponentIds()).toEqual(['comp-2']);

      // Cleanup all remaining
      lifecycleManager.cleanupAll();

      expect(lifecycleManager.hasComponent('comp-2')).toBe(false);
      expect(lifecycleManager.getActiveComponentIds()).toEqual([]);
    });

    it('should maintain component isolation between different instances', async () => {
      const manager1 = new ComponentLifecycleManager();
      const manager2 = new ComponentLifecycleManager();

      const config = createBasicConfig();

      await manager1.createComponent('shared-id', { ...config, containerId: 'container-1' });
      await manager2.createComponent('shared-id', { ...config, containerId: 'container-2' });

      expect(manager1.hasComponent('shared-id')).toBe(true);
      expect(manager2.hasComponent('shared-id')).toBe(true);

      manager1.destroyComponent('shared-id');

      expect(manager1.hasComponent('shared-id')).toBe(false);
      expect(manager2.hasComponent('shared-id')).toBe(true);
    });
  });
});
