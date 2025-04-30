export interface ChromeStorageAdapter {
  syncGet<T = Record<string, any>>(keys?: string | string[] | null): Promise<T>;
  syncSet(items: Record<string, any>): Promise<void>;
  localGet<T = Record<string, any>>(keys?: string | string[] | null): Promise<T>;
  localSet(items: Record<string, any>): Promise<void>;
}

export class DefaultChromeStorageAdapter implements ChromeStorageAdapter {
  syncGet<T = Record<string, any>>(keys?: string | string[] | null): Promise<T> {
    return chrome.storage.sync.get(keys) as Promise<T>;
  }

  syncSet(items: Record<string, any>): Promise<void> {
    return chrome.storage.sync.set(items);
  }

  localGet<T = Record<string, any>>(keys?: string | string[] | null): Promise<T> {
    return chrome.storage.local.get(keys) as Promise<T>;
  }

  localSet(items: Record<string, any>): Promise<void> {
    return chrome.storage.local.set(items);
  }
}
