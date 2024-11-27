export function injectUploadFeatures() {
  const debug = (msg: string) => {
    console.log(`[Content Script] ${msg}`);
    chrome.runtime.sendMessage({ type: 'DEBUG', message: msg });
  };

  debug('Content script starting initialization');

  // Flag to track GitHub upload
  let isGitHubUpload = false;
  let isSettingsValid = false;

  // Check GitHub settings validity
  const getGitHubSettings = async () => {
    const settings = await chrome.storage.sync.get([
      'githubToken',
      'repoOwner',
      'projectSettings'
    ]);

    console.log('🔍 Settings (buttonInjector):', settings);

    const projectId = await chrome.storage.sync.get('projectId');
    let projectSettings = settings.projectSettings?.[projectId.projectId];

    console.log('🔍 Project Settings (buttonInjector):', projectSettings);

    if (!projectSettings && projectId.projectId && settings.repoOwner && settings.githubToken) {
      projectSettings = { repoName: projectId.projectId, branch: 'main' };
      console.log('🔍 Valid settings found, but no project settings. Automatically saving new project settings', projectSettings);
      await chrome.storage.sync.set({ [`projectSettings.${projectId.projectId}`]: projectSettings });
    }
    
    isSettingsValid = Boolean(
      settings.githubToken &&
      settings.repoOwner &&
      settings.projectSettings &&
      projectSettings
    );
    
    // Update button state if it exists
    const button = document.querySelector('[data-github-upload]') as HTMLButtonElement;
    if (button) {
      updateButtonState(button);
    }

    console.log('🔍 Project Settings:', projectSettings, 'isSettingsValid:', isSettingsValid);
    
    return { isSettingsValid, projectSettings };
  };

  // Function to update button appearance based on settings validity
  const updateButtonState = (button: HTMLButtonElement) => {
    if (isSettingsValid) {
      button.classList.remove('opacity-60');
      button.title = 'Upload to GitHub';
    } else {
      button.classList.add('opacity-60');
      button.title = 'GitHub settings not configured. Click to configure.';
    }
  };

  // Function to show confirmation dialog
  const showGitHubConfirmation = (projectSettings: Record<string, { repoName: string; branch: string }>): Promise<{ confirmed: boolean; commitMessage?: string }> => {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.zIndex = '9999';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      overlay.className = [
        'fixed',
        'inset-0',
        'flex',
        'items-center',
        'justify-center'
      ].join(' ');

      const dialog = document.createElement('div');
      dialog.style.zIndex = '10000';
      dialog.style.width = '320px'; // Set fixed width
      dialog.style.backgroundColor = '#0f172a'; // Match bg-slate-900
      dialog.className = [
        'p-6',
        'rounded-lg',
        'shadow-xl',
        'mx-4',
        'space-y-4',
        'border',
        'border-slate-700',
        'relative'
      ].join(' ');

      dialog.innerHTML = `
        <h3 class="text-lg font-semibold text-white">Confirm GitHub Upload</h3>
        <p class="text-slate-300 text-sm">Are you sure you want to upload this project to GitHub? <br />
          <span class="font-mono">${projectSettings.repoName} / ${projectSettings.branch}</span>
        </p>
        <div class="mt-4">
          <label for="commit-message" class="block text-sm text-slate-300 mb-2">Commit message (optional)</label>
          <input 
            type="text" 
            id="commit-message" 
            placeholder="Commit from Bolt to GitHub"
            class="w-full px-3 py-2 text-sm rounded-md bg-slate-800 text-white border border-slate-700 focus:border-blue-500 focus:outline-none"
          >
        </div>
        <div class="flex justify-end gap-3 mt-6">
          <button class="px-4 py-2 text-sm rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700" id="cancel-upload">
            Cancel
          </button>
          <button class="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700" id="confirm-upload">
            Upload
          </button>
        </div>
      `;

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      // Handle clicks
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
          resolve({ confirmed: false });
        }
      });

      dialog.querySelector('#cancel-upload')?.addEventListener('click', () => {
        document.body.removeChild(overlay);
        resolve({ confirmed: false });
      });

      dialog.querySelector('#confirm-upload')?.addEventListener('click', () => {
        const commitMessage = (dialog.querySelector('#commit-message') as HTMLInputElement)?.value || 'Commit from Bolt to GitHub';
        document.body.removeChild(overlay);
        resolve({ confirmed: true, commitMessage });
      });
    });
  };

  // Also update the notification z-index
  const showSettingsNotification = () => {
    const notification = document.createElement('div');
    notification.style.zIndex = '10000';
    notification.className = [
      'fixed',
      'top-4',
      'right-4',
      'p-4',
      'bg-red-500',
      'text-white',
      'rounded-md',
      'shadow-lg',
      'flex',
      'items-center',
      'gap-2',
      'text-sm'
    ].join(' ');
    
    notification.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span>
        Please configure your GitHub settings first. 
        <button class="text-white font-medium hover:text-white/90 underline underline-offset-2">Open Settings</button>
      </span>
    `;

    // Add click handler for settings button
    const settingsButton = notification.querySelector('button');
    settingsButton?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
      document.body.removeChild(notification);
    });

    // Add close button
    const closeButton = document.createElement('button');
    closeButton.className = 'ml-2 text-white hover:text-white/90 font-medium text-lg leading-none';
    closeButton.innerHTML = '×';
    closeButton.addEventListener('click', () => {
      document.body.removeChild(notification);
    });
    notification.appendChild(closeButton);

    // Add to body and remove after 5 seconds
    document.body.appendChild(notification);
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 5000);
  };

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
            if (response?.error) {
              showSettingsNotification();
            }
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
  const insertButton = async () => {
    // Check if button already exists first
    if (document.querySelector('[data-github-upload]')) {
      debug('GitHub button already exists, skipping insertion');
      return;
    }

    const buttonContainer = document.querySelector('div.flex.grow-1.basis-60 div.flex.gap-2');
    if (!buttonContainer) {
      debug('❌ Button container not found');
      return;
    }

    await getGitHubSettings();

    const button = document.createElement('button');
    button.setAttribute('data-github-upload', 'true');
    button.setAttribute('data-testid', 'github-upload-button'); // Add a testid for easier querying
    button.className = [
      'rounded-md',
      'items-center',
      'justify-center',
      'outline-accent-600',
      'px-3',
      'py-1.25',
      'disabled:cursor-not-allowed',
      'text-xs',
      'bg-bolt-elements-button-secondary-background',
      'text-bolt-elements-button-secondary-text',
      'enabled:hover:bg-bolt-elements-button-secondary-backgroundHover',
      'flex',
      'gap-1.7',
      'transition-opacity'
    ].join(' ');

    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 2px;">
        <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
      GitHub
    `;

    button.addEventListener('click', async () => {
      debug('GitHub button clicked');
      
      // Check settings before proceeding
      const settings = await getGitHubSettings();
      console.log('🔍 Check settings before proceeding:', settings);
      if (!settings.isSettingsValid) {
        showSettingsNotification();
        return;
      }

      // Show confirmation dialog
      const { confirmed, commitMessage } = await showGitHubConfirmation(settings.projectSettings);
      if (!confirmed) {
        debug('GitHub upload cancelled by user');
        return;
      }

      isGitHubUpload = true;
      // Send commit message to background
      chrome.runtime.sendMessage({ type: 'SET_COMMIT_MESSAGE', message: commitMessage });
      
      const downloadBtn = buttonContainer.querySelector('button:first-child') as HTMLButtonElement;
      if (downloadBtn) {
        downloadBtn.click();
      }
      // Reset the flag after a short delay
      setTimeout(() => {
        isGitHubUpload = false;
      }, 1000);
    });

    updateButtonState(button);

    // Only insert if a button doesn't already exist in this container
    if (!buttonContainer.querySelector('[data-github-upload]')) {
      const deployButton = buttonContainer.querySelector('button:last-child');
      if (deployButton) {
        deployButton.before(button);
        debug('GitHub button inserted successfully');
      }
    }
  };

  // Track the source of the click
  let clickSource: HTMLElement | null = null;

  // Set up global click interceptor with capture phase
  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    clickSource = target;
    debug(`Click detected on element: ${target.tagName}`);

    if (target instanceof HTMLElement) {
      debug(`Element attributes: ${Array.from(target.attributes)
        .map(attr => `${attr.name}="${attr.value}"`)
        .join(', ')}`);
    }

    // Check if this is coming from the GitHub button
    const isFromGitHubButton = target.closest('[data-github-upload]') !== null;
    
    // Find the closest download link or button
    const downloadElement = target.closest('a[download], button[download]');
    if (downloadElement) {
      debug('Download element found!');
      debug(`Click source: ${isFromGitHubButton ? 'GitHub Button' : 'Download Button'}`);

      // Only handle blobs for GitHub upload
      if (isFromGitHubButton || isGitHubUpload) {
        // Look for visible or hidden download links
        const downloadLinks = document.querySelectorAll('a[download][href^="blob:"]');
        debug(`Found ${downloadLinks.length} download links`);

        for (const link of Array.from(downloadLinks)) {
          const blobUrl = (link as HTMLAnchorElement).href;
          debug(`Found blob URL: ${blobUrl}`);
          await handleBlobUrl(blobUrl);
        }

        // Prevent download only for GitHub upload
        debug('Preventing browser download for GitHub upload');
        e.preventDefault();
        e.stopPropagation();
      } else {
        debug('Regular download, not intercepting');
      }
    }
  }, true);

  // Additional event listener to catch the actual download
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('a[download][href^="blob:"]')) {
      const isFromGitHubButton = clickSource?.closest('[data-github-upload]') !== null;
      if (isFromGitHubButton || isGitHubUpload) {
        debug('Preventing direct download link click during GitHub upload');
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, true);

  // Listen for storage changes to update button state
  chrome.storage.onChanged.addListener((changes) => {
    const settingsChanged = ['githubToken', 'repoOwner', 'repoName', 'branch']
      .some(key => key in changes);
    
    if (settingsChanged) {
      getGitHubSettings();
    }
  });

  // Initial button injection
  insertButton();

  // Watch for DOM changes with a debounced check
  let timeoutId: number | undefined;
  const observer = new MutationObserver(() => {
    // Clear any existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Set a new timeout
    timeoutId = window.setTimeout(() => {
      const button = document.querySelector('[data-github-upload]');
      const buttonContainer = document.querySelector('div.flex.grow-1.basis-60 div.flex.gap-2');
      
      // Only insert if there's no button but there is a container
      if (!button && buttonContainer) {
        insertButton();
      }
    }, 100); // Debounce for 100ms
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Cleanup function for the observer and timeout
  const cleanup = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    observer.disconnect();
  };

  // Cleanup on page unload
  window.addEventListener('unload', cleanup);

  debug('Content script initialization complete');
}
