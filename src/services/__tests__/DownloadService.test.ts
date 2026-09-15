import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadService } from '../DownloadService';

const September2026DirectDownloadFixture = readFileSync(
  resolvePath(process.cwd(), 'bolt-download-button-v4.html'),
  'utf8'
);

const serviceMocks = vi.hoisted(() => ({
  getCachedProjectFiles: vi.fn(),
  cacheProjectFiles: vi.fn(),
  invalidateCache: vi.fn(),
  processZipBlob: vi.fn(),
}));

interface DownloadServiceWithPrivateMethods {
  findAndClickDownloadButton: () => Promise<void>;
  findAndClickExportButton: () => Promise<void>;
}

global.PointerEvent = class PointerEvent extends Event {
  constructor(type: string, eventInitDict?: PointerEventInit) {
    super(type, eventInitDict);
  }
} as unknown as typeof PointerEvent;

vi.mock('../../lib/utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../lib/utils/projectId', () => ({
  getCurrentProjectId: vi.fn(() => 'test-project-id'),
}));

vi.mock('../../lib/zip', () => ({
  ZipProcessor: { processZipBlob: serviceMocks.processZipBlob },
}));

vi.mock('../CacheService', () => ({
  CacheService: {
    getInstance: vi.fn(() => ({
      getCachedProjectFiles: serviceMocks.getCachedProjectFiles,
      cacheProjectFiles: serviceMocks.cacheProjectFiles,
      invalidateCache: serviceMocks.invalidateCache,
    })),
  },
}));

vi.mock('../IdleMonitorService', () => ({
  IdleMonitorService: {
    getInstance: vi.fn(() => ({})),
  },
}));

describe('DownloadService', () => {
  let downloadService: DownloadService;

  beforeEach(() => {
    document.body.innerHTML = '';

    downloadService = new DownloadService();

    vi.spyOn(document, 'addEventListener').mockImplementation(() => {});
    serviceMocks.getCachedProjectFiles.mockReset();
    serviceMocks.cacheProjectFiles.mockReset();
    serviceMocks.invalidateCache.mockReset();
    serviceMocks.processZipBlob.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();

    document.body.innerHTML = '';
  });

  describe('findAndClickDownloadButton', () => {
    it('should find download button with file-archive icon', async () => {
      const dropdown = document.createElement('div');
      dropdown.setAttribute('role', 'menu');

      const downloadMenuItem = document.createElement('div');
      downloadMenuItem.setAttribute('role', 'menuitem');
      downloadMenuItem.textContent = 'Download';

      const fileArchiveIcon = document.createElement('span');
      fileArchiveIcon.className = 'i-lucide:file-archive size-4 mt-0.5';
      downloadMenuItem.appendChild(fileArchiveIcon);

      dropdown.appendChild(downloadMenuItem);
      document.body.appendChild(dropdown);

      const clickSpy = vi.spyOn(downloadMenuItem, 'click');

      const findAndClickDownloadButton = (
        downloadService as unknown as DownloadServiceWithPrivateMethods
      ).findAndClickDownloadButton.bind(downloadService);
      await findAndClickDownloadButton();

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should find download button by text content as fallback', async () => {
      const dropdown = document.createElement('div');
      dropdown.setAttribute('role', 'menu');

      const downloadMenuItem = document.createElement('div');
      downloadMenuItem.setAttribute('role', 'menuitem');
      downloadMenuItem.textContent = 'Download';

      dropdown.appendChild(downloadMenuItem);
      document.body.appendChild(dropdown);

      const clickSpy = vi.spyOn(downloadMenuItem, 'click');

      const findAndClickDownloadButton = (
        downloadService as unknown as DownloadServiceWithPrivateMethods
      ).findAndClickDownloadButton.bind(downloadService);
      await findAndClickDownloadButton();

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should find download button in button element as fallback', async () => {
      const dropdown = document.createElement('div');
      dropdown.setAttribute('role', 'menu');

      const downloadButton = document.createElement('button');
      downloadButton.textContent = 'Download';

      const downloadIcon = document.createElement('span');
      downloadIcon.className = 'i-lucide:download size-4';
      downloadButton.appendChild(downloadIcon);

      dropdown.appendChild(downloadButton);
      document.body.appendChild(dropdown);

      const clickSpy = vi.spyOn(downloadButton, 'click');

      const findAndClickDownloadButton = (
        downloadService as unknown as DownloadServiceWithPrivateMethods
      ).findAndClickDownloadButton.bind(downloadService);
      await findAndClickDownloadButton();

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should throw error when no download button is found', async () => {
      const dropdown = document.createElement('div');
      dropdown.setAttribute('role', 'menu');
      dropdown.innerHTML = '<div role="menuitem">Other Item</div>';
      document.body.appendChild(dropdown);

      const findAndClickDownloadButton = (
        downloadService as unknown as DownloadServiceWithPrivateMethods
      ).findAndClickDownloadButton.bind(downloadService);

      await expect(findAndClickDownloadButton()).rejects.toThrow(
        'Download button not found in any dropdown after multiple attempts'
      );
    });
  });

  describe('findAndClickExportButton', () => {
    it('opens the September 2026 project menu and clicks its direct Download item', async () => {
      const unrelatedMenu = document.createElement('div');
      unrelatedMenu.setAttribute('role', 'menu');
      unrelatedMenu.innerHTML = '<div role="menuitem">Download</div>';
      const unrelatedDownload = unrelatedMenu.querySelector<HTMLElement>('[role="menuitem"]')!;
      const unrelatedSpy = vi.spyOn(unrelatedDownload, 'click');
      document.body.appendChild(unrelatedMenu);

      document.body.insertAdjacentHTML('beforeend', September2026DirectDownloadFixture);
      const projectNameButton = Array.from(
        document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]')
      ).find((button) => button.textContent?.includes('VitePress Starter'))!;
      projectNameButton.setAttribute('data-state', 'closed');
      const controlledMenu = document.getElementById(
        projectNameButton.getAttribute('aria-controls')!
      );
      const directDownload = Array.from(
        controlledMenu!.querySelectorAll<HTMLElement>('[role="menuitem"]')
      ).find((item) => item.textContent?.trim() === 'Download')!;
      const downloadSpy = vi.spyOn(directDownload, 'click');

      const privateService = downloadService as unknown as DownloadServiceWithPrivateMethods;
      await privateService.findAndClickExportButton();
      await privateService.findAndClickDownloadButton();

      expect(downloadSpy).toHaveBeenCalledOnce();
      expect(unrelatedSpy).not.toHaveBeenCalled();
    });

    it('should find project status dropdown button', async () => {
      const projectStatusButton = document.createElement('button');
      projectStatusButton.setAttribute('aria-haspopup', 'menu');
      projectStatusButton.textContent = 'Memory Palace Trainer App';

      const container = document.createElement('div');
      container.className = 'flex-1 select-text';
      const innerContainer = document.createElement('div');
      innerContainer.className = 'flex items-center justify-center';
      innerContainer.appendChild(projectStatusButton);
      container.appendChild(innerContainer);
      document.body.appendChild(container);

      const exportMenuItem = document.createElement('div');
      exportMenuItem.setAttribute('role', 'menuitem');
      exportMenuItem.textContent = 'Export';

      const dropdown = document.createElement('div');
      dropdown.setAttribute('role', 'menu');
      dropdown.appendChild(exportMenuItem);
      document.body.appendChild(dropdown);

      const clickSpy = vi.spyOn(projectStatusButton, 'click');

      const findAndClickExportButton = (
        downloadService as unknown as DownloadServiceWithPrivateMethods
      ).findAndClickExportButton.bind(downloadService);
      await findAndClickExportButton();

      expect(clickSpy).toHaveBeenCalled();
    });

    it('finds project name dropdown when chevron uses i-ph:caret-down (May 2026 Bolt DOM)', async () => {
      // Bolt swapped icon library from Lucide to Phosphor / Heroicons.
      // Project-name button now uses i-ph:caret-down instead of i-lucide:chevron-down.
      const projectNameButton = document.createElement('button');
      projectNameButton.setAttribute('aria-haspopup', 'menu');
      projectNameButton.setAttribute('data-state', 'closed');
      projectNameButton.innerHTML = `
        <span class="mt-px truncate sm:max-w-80">VitePress Starter (forked)</span>
        <span class="i-ph:caret-down size-4"></span>
      `;
      document.body.appendChild(projectNameButton);

      const menu = document.createElement('div');
      menu.setAttribute('role', 'menu');
      const exportItem = document.createElement('div');
      exportItem.setAttribute('role', 'menuitem');
      exportItem.innerHTML =
        '<span class="i-heroicons:arrow-down-tray size-4"></span>Export<span class="i-ph:caret-right ml-auto size-4"></span>';
      menu.appendChild(exportItem);
      document.body.appendChild(menu);

      const clickSpy = vi.spyOn(projectNameButton, 'click');

      const findAndClickExportButton = (
        downloadService as unknown as DownloadServiceWithPrivateMethods
      ).findAndClickExportButton.bind(downloadService);
      await findAndClickExportButton();

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('public contract', () => {
    it('downloadProjectZip reuses an in-flight download and returns the captured blob', async () => {
      const capturedBlob = new Blob(['project']);
      let finishDownload: ((blob: Blob) => void) | undefined;
      const privateService = downloadService as unknown as {
        setupDownloadInterception: (resolve: (blob: Blob) => void) => void;
        findAndClickExportButton: () => Promise<void>;
        findAndClickDownloadButton: () => Promise<void>;
      };
      vi.spyOn(privateService, 'setupDownloadInterception').mockImplementation((resolve) => {
        finishDownload = resolve;
      });
      const openMenu = vi.spyOn(privateService, 'findAndClickExportButton').mockResolvedValue();
      vi.spyOn(privateService, 'findAndClickDownloadButton').mockResolvedValue();

      const first = downloadService.downloadProjectZip();
      const second = downloadService.downloadProjectZip();
      finishDownload?.(capturedBlob);

      await expect(first).resolves.toBe(capturedBlob);
      await expect(second).resolves.toBe(capturedBlob);
      expect(openMenu).toHaveBeenCalledOnce();
    });

    it('getProjectFiles returns cached files unless refresh is forced', async () => {
      const cached = new Map([['cached.txt', 'cached']]);
      const refreshed = new Map([['fresh.txt', 'fresh']]);
      const blob = new Blob(['zip']);
      serviceMocks.getCachedProjectFiles.mockReturnValue(cached);
      serviceMocks.processZipBlob.mockResolvedValue(refreshed);
      vi.spyOn(downloadService, 'downloadProjectZip').mockResolvedValue(blob);

      await expect(downloadService.getProjectFiles()).resolves.toBe(cached);
      await expect(downloadService.getProjectFiles(true)).resolves.toBe(refreshed);
      expect(serviceMocks.cacheProjectFiles).toHaveBeenCalledWith('test-project-id', refreshed);
    });

    it('invalidateCache clears the resolved project cache', async () => {
      serviceMocks.getCachedProjectFiles.mockReturnValue(new Map([['file.txt', 'content']]));
      await downloadService.getProjectFiles();

      downloadService.invalidateCache();

      expect(serviceMocks.invalidateCache).toHaveBeenCalledWith('test-project-id');
    });

    it('blobToBase64 returns the encoded blob contents', async () => {
      await expect(downloadService.blobToBase64(new Blob(['Bolt']))).resolves.toBe('Qm9sdA==');
    });
  });

  describe('findAndClickDownloadButton with May 2026 Bolt DOM', () => {
    it('finds download menuitem when icon class uses i-ph:file-archive', async () => {
      // Submenu icon class moved from i-lucide:file-archive to i-ph:file-archive.
      const submenu = document.createElement('div');
      submenu.setAttribute('role', 'menu');

      const downloadItem = document.createElement('div');
      downloadItem.setAttribute('role', 'menuitem');
      downloadItem.innerHTML = '<span class="i-ph:file-archive size-4 mt-0.5"></span>Download';
      submenu.appendChild(downloadItem);

      const stackBlitzItem = document.createElement('div');
      stackBlitzItem.setAttribute('role', 'menuitem');
      stackBlitzItem.innerHTML =
        '<span class="i-bolt:logos-stackblitz size-4"></span><span>Open in StackBlitz</span>';
      submenu.appendChild(stackBlitzItem);

      document.body.appendChild(submenu);

      const downloadSpy = vi.spyOn(downloadItem, 'click');
      const stackBlitzSpy = vi.spyOn(stackBlitzItem, 'click');

      const findAndClickDownloadButton = (
        downloadService as unknown as DownloadServiceWithPrivateMethods
      ).findAndClickDownloadButton.bind(downloadService);
      await findAndClickDownloadButton();

      expect(downloadSpy).toHaveBeenCalled();
      expect(stackBlitzSpy).not.toHaveBeenCalled();
    });
  });
});
