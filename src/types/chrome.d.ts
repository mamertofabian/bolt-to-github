declare namespace chrome {
  namespace tabs {
    function create(createProperties: {
      url: string;
      active?: boolean;
      pinned?: boolean;
      index?: number;
      windowId?: number;
    }): Promise<chrome.tabs.Tab>;
  }

  interface Tab {
    id?: number;
    index: number;
    pinned: boolean;
    highlighted: boolean;
    windowId: number;
    active: boolean;
    url?: string;
    title?: string;
    favIconUrl?: string;
    status?: string;
    incognito: boolean;
  }
}
