// Mock the logger module
jest.mock('../../../lib/utils/logger', () => ({
  createLogger: jest.fn().mockReturnValue({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { ComponentLifecycleManager, type ComponentConfig } from '../ComponentLifecycleManager';
import type { SvelteComponent } from '../../types/UITypes';
import { createLogger } from '../../../lib/utils/logger';

// Get the mocked logger with proper typing
const mockLogger = createLogger('ComponentLifecycleManager') as jest.Mocked<
  ReturnType<typeof createLogger>
>;

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
    mockLogger.log.mockClear();
    mockLogger.error.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.info.mockClear();

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
      expect(mockLogger.info).toHaveBeenCalledWith(
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
          position: 'absolute',
          top: '10px',
        },
      };

      await lifecycleManager.createComponent('test-component', config);

      expect(mockElement.style.position).toBe('absolute');
      expect(mockElement.style.top).toBe('10px');
    });

    it('should pass props to component constructor', async () => {
      const config: ComponentConfig = {
        ...createBasicConfig(),
        props: { testProp: 'value' },
      };

      const component = await lifecycleManager.createComponent<MockSvelteComponent>(
        'test-component',
        config
      );

      expect(component.props).toEqual({ testProp: 'value' });
    });

    it('should append container to document.body by default', async () => {
      const config = createBasicConfig();

      await lifecycleManager.createComponent('test-component', config);

      expect(mockDocument.body.appendChild).toHaveBeenCalledWith(mockElement);
    });

    it('should not append to body when appendToBody is false', async () => {
      const config: ComponentConfig = {
        ...createBasicConfig(),
        appendToBody: false,
      };

      await lifecycleManager.createComponent('test-component', config);

      expect(mockDocument.body.appendChild).not.toHaveBeenCalled();
    });

    it('should warn when document.body is not available and appendToBody is true', async () => {
      // Set body to null
      Object.defineProperty(global.document, 'body', {
        value: null,
        writable: true,
      });

      const config = createBasicConfig();

      await lifecycleManager.createComponent('test-component', config);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Cannot append container 'test-container' - document.body not available"
      );
    });

    it('should remove existing container with same id before creating new one', async () => {
      // Create existing element
      const existingElement = {
        id: 'test-container',
        parentNode: {
          removeChild: jest.fn(),
        },
        remove: jest.fn(),
      };

      mockDocument.getElementById.mockReturnValue(existingElement as any);

      const config = createBasicConfig();
      await lifecycleManager.createComponent('test-component', config);

      expect(existingElement.remove).toHaveBeenCalled();
    });

    it('should clean up existing component with same id before creating new one', async () => {
      const config = createBasicConfig();
      const firstComponent = await lifecycleManager.createComponent<MockSvelteComponent>(
        'test-component',
        config
      );

      // Create new component with same id
      const secondComponent = await lifecycleManager.createComponent<MockSvelteComponent>(
        'test-component',
        config
      );

      expect(firstComponent.$destroyCallCount).toBe(1);
      expect(secondComponent).not.toBe(firstComponent);
    });

    it('should wait for DOMContentLoaded when waitForBody is true and body is not available', async () => {
      // Set body to null
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
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Waiting for body to be available for component 'test-component'"
      );
      expect(mockDocument.addEventListener).toHaveBeenCalledWith(
        'DOMContentLoaded',
        expect.any(Function)
      );

      // Simulate DOMContentLoaded
      const [[, callback]] = mockDocument.addEventListener.mock.calls;
      Object.defineProperty(global.document, 'body', {
        value: { appendChild: jest.fn() },
        writable: true,
      });
      callback();

      await createPromise;

      expect(lifecycleManager.hasComponent('test-component')).toBe(true);
    });

    it('should handle constructor errors gracefully', async () => {
      const FailingComponent = jest.fn().mockImplementation(() => {
        throw new Error('Component constructor failed');
      });

      const config: ComponentConfig = {
        constructor: FailingComponent,
        containerId: 'test-container',
      };

      await expect(lifecycleManager.createComponent('test-component', config)).rejects.toThrowError(
        'Component constructor failed'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        "🔊 Error creating component 'test-component':",
        expect.any(Error)
      );
    });

    it('should handle unexpected errors during component creation', async () => {
      // Cause document.createElement to fail
      mockDocument.createElement.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const config = createBasicConfig();

      await expect(lifecycleManager.createComponent('test-component', config)).rejects.toThrowError(
        'Unexpected error'
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

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Component 'non-existent' not found or doesn't support $set"
      );
    });

    it('should warn when component does not support $set', async () => {
      const ComponentWithoutSet = jest.fn().mockImplementation(({ target }) => ({
        target,
        // No $set method
      }));

      const config: ComponentConfig = {
        constructor: ComponentWithoutSet,
        containerId: 'test-container',
      };

      await lifecycleManager.createComponent('test-component', config);

      lifecycleManager.updateComponent('test-component', { test: 'value' });

      expect(mockLogger.warn).toHaveBeenCalledWith(
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
      expect(mockLogger.info).toHaveBeenCalledWith("🔊 Component 'test-component' destroyed");
      expect(mockLogger.info).toHaveBeenCalledWith(
        "🔊 Container for component 'test-component' removed"
      );
    });

    it('should handle destroying non-existent component gracefully', () => {
      expect(() => {
        lifecycleManager.destroyComponent('non-existent');
      }).not.toThrow();
    });

    it('should handle component without $destroy method gracefully', async () => {
      const ComponentWithoutDestroy = jest.fn().mockImplementation(({ target }) => ({
        target,
        // No $destroy method
      }));

      const config: ComponentConfig = {
        constructor: ComponentWithoutDestroy,
        containerId: 'test-container',
      };

      await lifecycleManager.createComponent('test-component', config);

      expect(() => {
        lifecycleManager.destroyComponent('test-component');
      }).not.toThrow();
    });

    it('should handle container without parent node gracefully', async () => {
      // Create component
      const config = createBasicConfig();
      await lifecycleManager.createComponent('test-component', config);

      // Remove parent node
      mockElement.parentNode = null;

      expect(() => {
        lifecycleManager.destroyComponent('test-component');
      }).not.toThrow();
    });
  });

  describe('getComponent', () => {
    it('should return component when it exists', async () => {
      const config = createBasicConfig();
      const component = await lifecycleManager.createComponent<MockSvelteComponent>(
        'test-component',
        config
      );

      expect(lifecycleManager.getComponent('test-component')).toBe(component);
    });

    it('should return null when component does not exist', () => {
      expect(lifecycleManager.getComponent('non-existent')).toBeNull();
    });
  });

  describe('getContainer', () => {
    it('should return container when it exists', async () => {
      const config = createBasicConfig();
      await lifecycleManager.createComponent('test-component', config);

      expect(lifecycleManager.getContainer('test-component')).toBe(mockElement);
    });

    it('should return null when container does not exist', () => {
      expect(lifecycleManager.getContainer('non-existent')).toBeNull();
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
      await lifecycleManager.createComponent('component-1', config);
      await lifecycleManager.createComponent('component-2', config);

      const ids = lifecycleManager.getActiveComponentIds();
      expect(ids).toContain('component-1');
      expect(ids).toContain('component-2');
      expect(ids).toHaveLength(2);
    });

    it('should not include destroyed components', async () => {
      const config = createBasicConfig();
      await lifecycleManager.createComponent('component-1', config);
      await lifecycleManager.createComponent('component-2', config);

      lifecycleManager.destroyComponent('component-1');

      const ids = lifecycleManager.getActiveComponentIds();
      expect(ids).toEqual(['component-2']);
    });
  });

  describe('cleanupAll', () => {
    it('should destroy all components and clear all maps', async () => {
      const config = createBasicConfig();
      const component1 = await lifecycleManager.createComponent<MockSvelteComponent>(
        'component-1',
        config
      );
      const component2 = await lifecycleManager.createComponent<MockSvelteComponent>(
        'component-2',
        config
      );

      lifecycleManager.cleanupAll();

      expect(component1.$destroyCallCount).toBe(1);
      expect(component2.$destroyCallCount).toBe(1);
      expect(lifecycleManager.getActiveComponentIds()).toEqual([]);
      expect(lifecycleManager.hasComponent('component-1')).toBe(false);
      expect(lifecycleManager.hasComponent('component-2')).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('🔊 Cleaning up all components');
    });

    it('should handle cleanup when no components exist', () => {
      lifecycleManager.cleanupAll();

      expect(lifecycleManager.getActiveComponentIds()).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith('🔊 Cleaning up all components');
    });
  });

  describe('cleanupByPattern', () => {
    it('should destroy only components matching the pattern', async () => {
      const config = createBasicConfig();
      const component1 = await lifecycleManager.createComponent<MockSvelteComponent>(
        'prefix-component-1',
        config
      );
      const component2 = await lifecycleManager.createComponent<MockSvelteComponent>(
        'prefix-component-2',
        config
      );
      const component3 = await lifecycleManager.createComponent<MockSvelteComponent>(
        'other-component',
        config
      );

      lifecycleManager.cleanupByPattern(/^prefix-/);

      expect(component1.$destroyCallCount).toBe(1);
      expect(component2.$destroyCallCount).toBe(1);
      expect(component3.$destroyCallCount).toBe(0);
      expect(lifecycleManager.hasComponent('prefix-component-1')).toBe(false);
      expect(lifecycleManager.hasComponent('prefix-component-2')).toBe(false);
      expect(lifecycleManager.hasComponent('other-component')).toBe(true);
    });

    it('should handle pattern that matches no components', async () => {
      const config = createBasicConfig();
      await lifecycleManager.createComponent('component-1', config);

      lifecycleManager.cleanupByPattern(/non-matching/);

      expect(lifecycleManager.hasComponent('component-1')).toBe(true);
    });

    it('should handle cleanup by pattern when no components exist', () => {
      expect(() => {
        lifecycleManager.cleanupByPattern(/test/);
      }).not.toThrow();
    });
  });

  describe('Complex scenarios', () => {
    it('should handle multiple component lifecycle operations', async () => {
      const config1 = createBasicConfig();
      const config2: ComponentConfig = {
        ...createBasicConfig(),
        containerId: 'container-2',
      };

      // Create multiple components
      const comp1 = await lifecycleManager.createComponent<MockSvelteComponent>('comp-1', config1);
      const comp2 = await lifecycleManager.createComponent<MockSvelteComponent>('comp-2', config2);

      // Update them
      lifecycleManager.updateComponent('comp-1', { updated: true });
      lifecycleManager.updateComponent('comp-2', { updated: true });

      expect(comp1.$setCallCount).toBe(1);
      expect(comp2.$setCallCount).toBe(1);

      // Destroy one
      lifecycleManager.destroyComponent('comp-1');

      expect(lifecycleManager.hasComponent('comp-1')).toBe(false);
      expect(lifecycleManager.hasComponent('comp-2')).toBe(true);

      // Clean up all
      lifecycleManager.cleanupAll();

      expect(lifecycleManager.getActiveComponentIds()).toEqual([]);
    });

    it('should maintain component isolation between different instances', async () => {
      const config = createBasicConfig();

      const comp1 = await lifecycleManager.createComponent<MockSvelteComponent>('comp-1', {
        ...config,
        props: { id: 1 },
      });
      const comp2 = await lifecycleManager.createComponent<MockSvelteComponent>('comp-2', {
        ...config,
        props: { id: 2 },
      });

      expect(comp1.props.id).toBe(1);
      expect(comp2.props.id).toBe(2);

      lifecycleManager.updateComponent('comp-1', { updated: true });

      expect(comp1.props).toEqual({ id: 1, updated: true });
      expect(comp2.props).toEqual({ id: 2 });
    });
  });
});
