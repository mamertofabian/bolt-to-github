import { ZipProcessor } from '../lib/zip';

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
      
      console.error('Error downloading project ZIP:', error);
      throw new Error(
        `Failed to download project ZIP: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Downloads the project ZIP and extracts its contents
   * @returns Promise resolving to a Map of filenames to file contents
   */
  public async getProjectFiles(): Promise<Map<string, string>> {
    const blob = await this.downloadProjectZip();
    return ZipProcessor.processZipBlob(blob);
  }

  /**
   * Sets up download interception by adding an event listener to capture download links
   * @param resolve Function to resolve the promise with the blob
   * @param reject Function to reject the promise with an error
   */
  private setupDownloadInterception(resolve: (blob: Blob) => void, reject: (error: Error) => void): void {
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
            console.error('Error intercepting download:', error);
            reject(new Error(`Failed to intercept download: ${error instanceof Error ? error.message : 'Unknown error'}`));
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
   * Finds and clicks the export button to open the dropdown
   */
  private async findAndClickExportButton(): Promise<void> {
    const exportButton = Array.from(document.querySelectorAll('button[aria-haspopup="menu"]')).find(
      (btn) => btn.textContent?.includes('Export') && btn.querySelector('.i-ph\\:export')
    ) as HTMLButtonElement;

    if (!exportButton) {
      throw new Error('Export button not found');
    }
    console.log('Found export button:', exportButton);

    // Dispatch keydown event to open dropdown
    const keydownEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    exportButton.dispatchEvent(keydownEvent);
    console.log('Dispatched keydown to export button');
    
    // Wait for the dropdown to appear
    await new Promise((resolve) => setTimeout(resolve, 200));
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
      console.log(
        `Waiting ${waitTime}ms for dropdown to appear (attempt ${attempts + 1}/${maxAttempts})`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Find all dropdowns
      const allDropdowns = Array.from(
        document.querySelectorAll('[role="menu"], [data-radix-menu-content]')
      );
      console.log('Found dropdowns:', allDropdowns.length);

      if (allDropdowns.length === 0) {
        console.log('No dropdowns found, will retry');
        attempts++;
        continue;
      }

      // Find the dropdown that contains download-related buttons
      exportDropdown = allDropdowns.find((dropdown) => {
        const buttons = dropdown.querySelectorAll('button');
        console.log('Checking dropdown with buttons:', buttons.length);

        // Check if any button in this dropdown has download text or icon
        return Array.from(buttons).some((button) => {
          const hasDownloadText = button.textContent?.toLowerCase().includes('download');
          const hasDownloadIcon = button.querySelector('[class*="i-ph:download-simple"]');
          return hasDownloadText || hasDownloadIcon;
        });
      });

      if (!exportDropdown) {
        console.log('No export dropdown found in this attempt, will retry');
        attempts++;
      }
    }

    if (!exportDropdown) {
      throw new Error('Export dropdown content not found after multiple attempts');
    }
    console.log('Found export dropdown:', exportDropdown);

    // Find download button within the identified export dropdown
    const downloadButton = Array.from(exportDropdown.querySelectorAll('button')).find(
      (button) => {
        // Search for the icon class anywhere within the button's descendants
        const hasIcon = button.querySelector('[class*="i-ph:download-simple"]');
        const hasText = button.textContent?.toLowerCase().includes('download');
        return hasIcon || hasText;
      }
    );

    if (!downloadButton) {
      throw new Error('Download button not found in dropdown');
    }

    console.log('Found download button, clicking...');
    
    // Click the download button - the click will be intercepted by our event listener
    downloadButton.click();
    
    // Close the dropdown by clicking outside or pressing Escape
    setTimeout(() => {
      try {
        console.log('Closing export dropdown...');
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
            console.log('Dropdown still open, clicking outside to close it');
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
        console.warn('Error while trying to close dropdown:', closeError);
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
