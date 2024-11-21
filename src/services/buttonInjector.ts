export function injectUploadFeatures() {
  const debug = (msg: string) => {
    console.log(`[Content Script] ${msg}`);
    chrome.runtime.sendMessage({ type: 'DEBUG', message: msg });
  };

  debug('Content script starting initialization');

  // Flag to track GitHub upload
  let isGitHubUpload = false;

  // Function to handle blob URL
  const handleBlobUrl = async (blobUrl: string) => {
    debug(`Processing blob URL: ${blobUrl}`);
    try {
      const response = await fetch(blobUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const blob = await response.blob();
      debug(`Fetched blob, size: ${blob.size} bytes`);

      const reader = new FileReader();
      reader.onload = () => {
        const base64data = reader.result?.toString().split(',')[1];
        if (base64data) {
          debug('Converting blob to base64 and sending to background');
          chrome.runtime.sendMessage({
            type: 'ZIP_DATA',
            data: base64data
          }, (response) => {
            debug(`Background script response: ${JSON.stringify(response)}`);
          });
        }
      };
      reader.onerror = () => debug(`FileReader error: ${reader.error}`);
      reader.readAsDataURL(blob);
    } catch (error) {
      debug(`Error processing blob: ${error}`);
    }
  };

  // Insert GitHub button
  const insertButton = () => {
    const buttonContainer = document.querySelector('div.flex.grow-1.basis-60 div.flex.gap-2');
    if (!buttonContainer) {
      debug('❌ Button container not found');
      return;
    }

    if (document.querySelector('[data-github-upload]')) {
      return;
    }

    const button = document.createElement('button');
    button.setAttribute('data-github-upload', 'true');
    button.className = [
      'rounded-md',
      'items-center',
      'justify-center',
      'outline-accent-600',
      'px-3',
      'py-1.25',
      'disabled:cursor-not-allowed',
      'disabled:opacity-60',
      'text-xs',
      'bg-bolt-elements-button-secondary-background',
      'text-bolt-elements-button-secondary-text',
      'enabled:hover:bg-bolt-elements-button-secondary-backgroundHover',
      'flex',
      'gap-1.7'
    ].join(' ');

    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 2px;">
        <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
      GitHub
    `;

    button.addEventListener('click', () => {
      debug('GitHub button clicked');
      isGitHubUpload = true;
      const downloadBtn = buttonContainer.querySelector('button:first-child') as HTMLButtonElement;
      if (downloadBtn) {
        downloadBtn.click();
      }
      // Reset the flag after a short delay
      setTimeout(() => {
        isGitHubUpload = false;
      }, 1000);
    });

    const deployButton = buttonContainer.querySelector('button:last-child');
    if (deployButton) {
      deployButton.before(button);
      debug('GitHub button inserted successfully');
    }
  };

  // Set up global click interceptor with capture phase
  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    debug(`Click detected on element: ${target.tagName}`);

    if (target instanceof HTMLElement) {
      debug(`Element attributes: ${Array.from(target.attributes)
        .map(attr => `${attr.name}="${attr.value}"`)
        .join(', ')}`);
    }

    // Find the closest download link or button
    const downloadElement = target.closest('a[download], button[download]');
    if (downloadElement) {
      debug('Download element found!');

      // Look for visible or hidden download links
      const downloadLinks = document.querySelectorAll('a[download][href^="blob:"]');
      debug(`Found ${downloadLinks.length} download links`);

      for (const link of Array.from(downloadLinks)) {
        const blobUrl = (link as HTMLAnchorElement).href;
        debug(`Found blob URL: ${blobUrl}`);
        await handleBlobUrl(blobUrl);

        // If this is triggered by GitHub button, prevent the download
        if (isGitHubUpload) {
          debug('Preventing browser download for GitHub upload');
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }
  }, true); // Using capture phase

  // Additional event listener to catch the actual download
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('a[download][href^="blob:"]') && isGitHubUpload) {
      debug('Preventing direct download link click during GitHub upload');
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // Initial button injection
  insertButton();

  // Watch for DOM changes
  const observer = new MutationObserver(() => {
    if (!document.querySelector('[data-github-upload]')) {
      insertButton();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  debug('Content script initialization complete');
}
