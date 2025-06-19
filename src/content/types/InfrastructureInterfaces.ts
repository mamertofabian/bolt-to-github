// Interfaces for infrastructure components

import type { SvelteComponent } from './UITypes';
import type { ComponentConfig } from '../infrastructure/ComponentLifecycleManager';

export interface IDOMObserver {
  start(callback: () => void, onError?: () => void): void;
  stop(): void;
  isActive(): boolean;
  getRetryCount(): number;
  resetRetryCount(): void;
}

export interface IComponentLifecycleManager {
  createComponent<T extends SvelteComponent>(id: string, config: ComponentConfig): Promise<T>;
  updateComponent(id: string, props: Record<string, unknown>): void;
  destroyComponent(id: string): void;
  getComponent<T extends SvelteComponent>(id: string): T | null;
  getContainer(id: string): HTMLElement | null;
  hasComponent(id: string): boolean;
  getActiveComponentIds(): string[];
  cleanupAll(): void;
  cleanupByPattern(pattern: RegExp): void;
}

// Base interface for all infrastructure components
export interface IBaseInfrastructure {
  initialize?(): void | Promise<void>;
  cleanup?(): void;
}
