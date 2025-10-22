import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadService } from '../DownloadService';

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
  ZipProcessor: vi.fn(),
}));

vi.mock('../CacheService', () => ({
  CacheService: {
    getInstance: vi.fn(() => ({
      getCachedFiles: vi.fn(),
      setCachedFiles: vi.fn(),
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
  });
});
