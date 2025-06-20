import { createLogger } from '../../lib/utils/logger';
import type { SvelteComponent } from 'svelte';

const logger = createLogger('ComponentLifecycleManager');

/**
 * Component configuration for creating Svelte components
 */
export interface ComponentConfig {
  constructor: typeof SvelteComponent; // Svelte component constructor
  containerId: string;
  containerClasses?: string[];
  containerStyles?: Record<string, string>;
  props?: Record<string, unknown>;
  appendToBody?: boolean;
  waitForBody?: boolean;
}

/**
 * ComponentLifecycleManager handles Svelte component creation, mounting, and cleanup
 * Provides centralized component lifecycle management to prevent memory leaks
 */
export class ComponentLifecycleManager {
  private components: Map<string, SvelteComponent> = new Map();
  private containers: Map<string, HTMLElement> = new Map();

  /**
   * Create and mount a Svelte component
   * @param id Unique identifier for the component
   * @param config Component configuration
   * @returns The created Svelte component
   */
  public createComponent<T extends SvelteComponent>(
    id: string,
    config: ComponentConfig
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      try {
        // Clean up existing component with same id
        this.destroyComponent(id);

        const createAndMountComponent = () => {
          try {
            // Create container
            const container = this.createContainer(config.containerId, config);
            this.containers.set(id, container);

            // Create component
            const component = new config.constructor({
              target: container,
              props: config.props || {},
            }) as T;

            this.components.set(id, component);
            logger.info(`🔊 Component '${id}' created successfully`);
            resolve(component);
          } catch (error) {
            logger.error(`🔊 Error creating component '${id}':`, error);
            reject(error);
          }
        };

        // Wait for document.body if needed
        if (config.waitForBody && !document.body) {
          logger.info(`Waiting for body to be available for component '${id}'`);
          document.addEventListener('DOMContentLoaded', createAndMountComponent);
        } else {
          createAndMountComponent();
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Create a container element for the component
   */
  private createContainer(containerId: string, config: ComponentConfig): HTMLElement {
    // Remove existing container with same id
    const existingContainer = document.getElementById(containerId);
    if (existingContainer) {
      existingContainer.remove();
    }

    const container = document.createElement('div');
    container.id = containerId;

    // Apply classes
    if (config.containerClasses && config.containerClasses.length > 0) {
      container.className = config.containerClasses.join(' ');
    }

    // Apply styles
    if (config.containerStyles) {
      Object.assign(container.style, config.containerStyles);
    }

    // Append to document
    if (config.appendToBody !== false) {
      if (document.body) {
        document.body.appendChild(container);
      } else {
        logger.warn(`Cannot append container '${containerId}' - document.body not available`);
      }
    }

    return container;
  }

  /**
   * Update component props
   * @param id Component identifier
   * @param props New props to set
   */
  public updateComponent(id: string, props: Record<string, unknown>): void {
    const component = this.components.get(id);
    if (component && component.$set) {
      component.$set(props);
    } else {
      logger.warn(`Component '${id}' not found or doesn't support $set`);
    }
  }

  /**
   * Destroy a specific component and its container
   * @param id Component identifier
   */
  public destroyComponent(id: string): void {
    const component = this.components.get(id);
    if (component) {
      if (component.$destroy) {
        component.$destroy();
      }
      this.components.delete(id);
      logger.info(`🔊 Component '${id}' destroyed`);
    }

    const container = this.containers.get(id);
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      this.containers.delete(id);
      logger.info(`🔊 Container for component '${id}' removed`);
    }
  }

  /**
   * Get a component by id
   * @param id Component identifier
   */
  public getComponent<T extends SvelteComponent>(id: string): T | null {
    return (this.components.get(id) as T) || null;
  }

  /**
   * Get a container by component id
   * @param id Component identifier
   */
  public getContainer(id: string): HTMLElement | null {
    return this.containers.get(id) || null;
  }

  /**
   * Check if a component exists and is active
   * @param id Component identifier
   */
  public hasComponent(id: string): boolean {
    return this.components.has(id);
  }

  /**
   * Get all active component ids
   */
  public getActiveComponentIds(): string[] {
    return Array.from(this.components.keys());
  }

  /**
   * Clean up all components and containers
   */
  public cleanupAll(): void {
    logger.info('🔊 Cleaning up all components');

    // Destroy all components
    for (const [id] of this.components) {
      this.destroyComponent(id);
    }

    // Clear maps
    this.components.clear();
    this.containers.clear();
  }

  /**
   * Clean up components by pattern (useful for cleaning up related components)
   * @param pattern RegExp pattern to match component ids
   */
  public cleanupByPattern(pattern: RegExp): void {
    const idsToDestroy = Array.from(this.components.keys()).filter((id) => pattern.test(id));
    idsToDestroy.forEach((id) => this.destroyComponent(id));
  }
}
