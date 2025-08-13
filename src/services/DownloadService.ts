import type { ProjectFiles } from '$lib/types';
import { createLogger } from '../lib/utils/logger';
import { getCurrentProjectId as getProjectIdFromUrl } from '../lib/utils/projectId';
import { ZipProcessor } from '../lib/zip';
import { CacheService } from './CacheService';
import { IdleMonitorService } from './IdleMonitorService';

const logger = createLogger('DownloadService');

/**
 * Service responsible for downloading project ZIP files from Bolt
 * and processing them for further use.
 */
export class DownloadService {
  // Flag to track if we're currently downloading
  private isDownloading = false;
  // Store the download promise to avoid multiple simultaneous downloads
  private currentDownloadPromise: Promise<Blob> | null = null;
  // Event listener for download interception
  private clickListener: ((e: MouseEvent) => void) | null = null;
  // Cache service for storing downloaded files
  private cacheService: CacheService = CacheService.getInstance(IdleMonitorService.getInstance());
  // Current project ID (extracted from URL)
  private currentProjectId: string | null = null;
  /**
   * Downloads the project ZIP file by finding and clicking the export/download buttons
   * @returns Promise resolving to the downloaded Blob
   */
  public async downloadProjectZip(): Promise<Blob> {
    // If already downloading, return the existing promise
    if (this.currentDownloadPromise) {
      return this.currentDownloadPromise;
    }

    try {
      // Set up download interception before triggering the download
      this.isDownloading = true;
      const blobPromise = new Promise<Blob>((resolve, reject) => {
        // Set up the click listener to intercept download links
        this.setupDownloadInterception(resolve, reject);

        // Start the download process
        this.findAndClickExportButton()
          .then(() => this.findAndClickDownloadButton())
          .catch((error) => {
            this.cleanupDownloadInterception();
            reject(error);
          });

        // Set a timeout in case the download doesn't trigger
        setTimeout(() => {
          if (this.isDownloading) {
            this.cleanupDownloadInterception();
            reject(new Error('Download timeout: No download link appeared after 10 seconds'));
          }
        }, 10000); // 10 second timeout
      });

      // Store the promise so we don't start multiple downloads
      this.currentDownloadPromise = blobPromise;

      // Wait for the download to complete
      const blob = await blobPromise;

      // Reset state after download completes
      this.cleanupDownloadInterception();
      this.currentDownloadPromise = null;

      return blob;
    } catch (error) {
      // Reset state on error
      this.cleanupDownloadInterception();
      this.currentDownloadPromise = null;

      logger.error('Error downloading project ZIP:', error);
      throw new Error(
        `Failed to download project ZIP: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Gets the current project ID from the URL
   * @returns The project ID or null if not found
   */
  private getCurrentProjectId(): string | null {
    return getProjectIdFromUrl();
  }

  /**
   * Downloads the project ZIP and extracts its contents, using cache when available
   * @param forceRefresh Whether to force a fresh download even if cache is available
   * @returns Promise resolving to a Map of filenames to file contents
   */
  public async getProjectFiles(forceRefresh = false): Promise<ProjectFiles> {
    // Get current project ID
    this.currentProjectId = this.getCurrentProjectId();
    if (!this.currentProjectId) {
      logger.warn('Could not determine project ID from URL');
      // Fall back to direct download without caching
      const blob = await this.downloadProjectZip();
      return ZipProcessor.processZipBlob(blob);
    }

    // Check cache first if not forcing refresh
    if (!forceRefresh) {
      const cachedFiles = this.cacheService.getCachedProjectFiles(this.currentProjectId);
      if (cachedFiles) {
        return cachedFiles;
      }
    }

    // Cache miss or forced refresh, download and cache
    logger.info(
      `Downloading project files for ${this.currentProjectId}${forceRefresh ? ' (forced refresh)' : ''}`
    );
    const blob = await this.downloadProjectZip();
    const files = await ZipProcessor.processZipBlob(blob);

    // Cache the downloaded files
    if (this.currentProjectId) {
      this.cacheService.cacheProjectFiles(this.currentProjectId, files);
    }

    return files;
  }

  /**
   * Invalidates the cache for the current project
   */
  public invalidateCache(): void {
    if (this.currentProjectId) {
      this.cacheService.invalidateCache(this.currentProjectId);
    }
  }

  /**
   * Sets up download interception by adding an event listener to capture download links
   * @param resolve Function to resolve the promise with the blob
   * @param reject Function to reject the promise with an error
   */
  private setupDownloadInterception(
    resolve: (blob: Blob) => void,
    reject: (error: Error) => void
  ): void {
    // Create a click listener to intercept download links
    this.clickListener = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLElement) {
        const downloadElement = target.closest('a[download], button[download]');
        if (downloadElement && this.isDownloading) {
          // Prevent the default download behavior
          e.preventDefault();
          e.stopPropagation();

          try {
            // Find all download links with blob URLs
            const downloadLinks = document.querySelectorAll('a[download][href^="blob:"]');
            if (downloadLinks.length > 0) {
              const blobUrl = (downloadLinks[0] as HTMLAnchorElement).href;
              const blob = await this.fetchBlobFromUrl(blobUrl);
              resolve(blob);
            }
          } catch (error) {
            logger.error('Error intercepting download:', error);
            reject(
              new Error(
                `Failed to intercept download: ${error instanceof Error ? error.message : 'Unknown error'}`
              )
            );
          }
        }
      }
    };

    // Add the listener with capture phase to intercept before default handling
    document.addEventListener('click', this.clickListener, true);
  }

  /**
   * Cleans up download interception by removing the event listener and resetting state
   */
  private cleanupDownloadInterception(): void {
    if (this.clickListener) {
      document.removeEventListener('click', this.clickListener, true);
      this.clickListener = null;
    }
    this.isDownloading = false;
  }

  /**
   * Opens the export dropdown. Bolt has evolved through different header structures:
   *  1. The classic "Export" button with the `i-ph:export` icon (legacy).
   *  2. The current project status dropdown → "Export" menu item → submenu with "Download".
   *
   * This helper is intentionally defensive so the extension keeps
   * working even if Bolt tweaks their DOM again.
   */
  private async findAndClickExportButton(): Promise<void> {
    // Helper: fully simulate a user click (pointerdown→mousedown→mouseup→click)
    const dispatchFullClick = (el: HTMLElement) => {
      const opts = { bubbles: true, cancelable: true } as const;
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      // `HTMLElement.click()` will fire the click event after the sequence above
      (el as HTMLButtonElement).click();
    };
    // ---------- STRATEGY 1: Original dedicated Export button ----------
    const legacyExportButton = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="menu"]')
    ).find((btn) => btn.textContent?.includes('Export') && btn.querySelector('.i-ph\\:export'));

    if (legacyExportButton) {
      logger.info('Found legacy export button:', legacyExportButton);
      // Trigger the dropdown via keyboard to mimic user interaction
      legacyExportButton.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          bubbles: true,
          cancelable: true,
        })
      );

      // wait briefly for dropdown to render
      await new Promise((resolve) => setTimeout(resolve, 200));
      return;
    }

    // ---------- STRATEGY 2: New project status dropdown ----------
    // Find the project status button in the center header area
    const projectStatusButton = document.querySelector<HTMLButtonElement>(
      '.flex-1.select-text .flex.items-center.justify-center button[aria-haspopup="menu"]'
    );

    if (!projectStatusButton) {
      throw new Error('Export menu trigger not found (legacy or project status button)');
    }

    logger.info('Found project status dropdown button:', projectStatusButton);

    // Click to open the project status dropdown using full event sequence (Radix listens to pointerdown)
    dispatchFullClick(projectStatusButton);

    // Attempt to locate the "Export" menu item with retries (menu can render lazily)
    let exportMenuItem: HTMLElement | undefined;
    const maxFindAttempts = 4;
    for (let i = 0; i < maxFindAttempts && !exportMenuItem; i++) {
      const waitTime = 150 * (i + 1);
      logger.info(`Searching for Export menu item (attempt ${i + 1}/${maxFindAttempts})`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      exportMenuItem = Array.from(
        document.querySelectorAll<HTMLElement>('[role="menuitem"],[data-radix-collection-item]')
      ).find((el) => {
        const txt = el.textContent?.toLowerCase() ?? '';
        return txt.includes('export');
      });
    }

    if (!exportMenuItem) {
      throw new Error('Export menu item not found inside project status dropdown after retries');
    }

    logger.info('Found Export menu item inside project status dropdown:', exportMenuItem);

    // Bolt seems to open sub-menus on hover, but to be safe we fire hover AND click.
    const pointerOver = new PointerEvent('pointerover', {
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    exportMenuItem.dispatchEvent(pointerOver);

    exportMenuItem.dispatchEvent(
      new MouseEvent('mouseover', {
        bubbles: true,
        cancelable: true,
      })
    );

    // Fallback click in case implementation changed
    exportMenuItem.click();

    // Wait for nested submenu to render
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  /**
   * Finds and clicks the download button in the export dropdown
   * This will trigger the download which will be intercepted by our click listener
   */
  private async findAndClickDownloadButton(): Promise<void> {
    let attempts = 0;
    const maxAttempts = 3;
    let exportDropdown = null;

    while (attempts < maxAttempts && !exportDropdown) {
      // Increase wait time with each attempt
      const waitTime = 200 * (attempts + 1);
      logger.info(
        `Waiting ${waitTime}ms for dropdown to appear (attempt ${attempts + 1}/${maxAttempts})`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Find all dropdowns
      const allDropdowns = Array.from(
        document.querySelectorAll('[role="menu"], [data-radix-menu-content]')
      );
      logger.info('Found dropdowns:', allDropdowns.length);

      if (allDropdowns.length === 0) {
        logger.info('No dropdowns found, will retry');
        attempts++;
        continue;
      }

      // Find the dropdown that contains download-related buttons
      exportDropdown = allDropdowns.find((dropdown) => {
        const buttons = dropdown.querySelectorAll('button');
        logger.info('Checking dropdown with buttons:', buttons.length);

        // Check if any button in this dropdown has download text or icon
        return Array.from(buttons).some((button) => {
          const hasDownloadText = button.textContent?.toLowerCase().includes('download');
          const hasDownloadIcon = button.querySelector('[class*="i-ph:download-simple"]');
          return hasDownloadText || hasDownloadIcon;
        });
      });

      if (!exportDropdown) {
        logger.info('No export dropdown found in this attempt, will retry');
        attempts++;
      }
    }

    if (!exportDropdown) {
      throw new Error('Export dropdown content not found after multiple attempts');
    }
    logger.info('Found export dropdown:', exportDropdown);

    // Find download button within the identified export dropdown
    const downloadButton = Array.from(exportDropdown.querySelectorAll('button')).find((button) => {
      // Search for the icon class anywhere within the button's descendants
      const hasIcon = button.querySelector('[class*="i-ph:download-simple"]');
      const hasText = button.textContent?.toLowerCase().includes('download');
      return hasIcon || hasText;
    });

    if (!downloadButton) {
      throw new Error('Download button not found in dropdown');
    }

    logger.info('Found download button, clicking...');

    // Click the download button - the click will be intercepted by our event listener
    downloadButton.click();

    // Close the dropdown by clicking outside or pressing Escape
    setTimeout(() => {
      try {
        logger.info('Closing export dropdown...');
        // Method 1: Try to dispatch Escape key to close the dropdown
        const escapeEvent = new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(escapeEvent);

        // Method 2: As a fallback, click outside the dropdown
        setTimeout(() => {
          // If dropdown is still open, click on the body element to close it
          const dropdowns = document.querySelectorAll('[role="menu"], [data-radix-menu-content]');
          if (dropdowns.length > 0) {
            logger.info('Dropdown still open, clicking outside to close it');
            // Click in an empty area of the page
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
            });
            document.body.dispatchEvent(clickEvent);
          }
        }, 100);
      } catch (closeError) {
        logger.warn('Error while trying to close dropdown:', closeError);
        // Non-critical error, don't throw
      }
    }, 300);
  }

  /**
   * Fetches a blob from a URL
   * @param blobUrl The blob URL to fetch
   * @returns Promise resolving to the fetched Blob
   */
  private async fetchBlobFromUrl(blobUrl: string): Promise<Blob> {
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.blob();
  }

  /**
   * Converts a blob to a base64 string
   * @param blob The blob to convert
   * @returns Promise resolving to the base64 string (without data URL prefix)
   */
  public async blobToBase64(blob: Blob): Promise<string | null> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64data = reader.result?.toString().split(',')[1] || null;
        resolve(base64data);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }
}
