import type { ChromeStorageAdapter } from '../ChromeStorageAdapter';

export class MockChromeStorageAdapter implements ChromeStorageAdapter {
  private syncStorage: Record<string, any> = {};
  private localStorage: Record<string, any> = {};

  constructor(
    initialSyncData: Record<string, any> = {},
    initialLocalData: Record<string, any> = {}
  ) {
    this.syncStorage = { ...initialSyncData };
    this.localStorage = { ...initialLocalData };
  }

  syncGet<T = Record<string, any>>(keys?: string | string[] | null): Promise<T> {
    if (!keys) {
      return Promise.resolve(this.syncStorage as T);
    }

    if (typeof keys === 'string') {
      return Promise.resolve({ [keys]: this.syncStorage[keys] } as T);
    }

    const result: Record<string, any> = {};
    keys.forEach((key) => {
      if (key in this.syncStorage) {
        result[key] = this.syncStorage[key];
      }
    });

    return Promise.resolve(result as T);
  }

  syncSet(items: Record<string, any>): Promise<void> {
    Object.assign(this.syncStorage, items);
    return Promise.resolve();
  }

  localGet<T = Record<string, any>>(keys?: string | string[] | null): Promise<T> {
    if (!keys) {
      return Promise.resolve(this.localStorage as T);
    }

    if (typeof keys === 'string') {
      return Promise.resolve({ [keys]: this.localStorage[keys] } as T);
    }

    const result: Record<string, any> = {};
    keys.forEach((key) => {
      if (key in this.localStorage) {
        result[key] = this.localStorage[key];
      }
    });

    return Promise.resolve(result as T);
  }

  localSet(items: Record<string, any>): Promise<void> {
    Object.assign(this.localStorage, items);
    return Promise.resolve();
  }
}
