import type {
  IContentUIElementFactory,
  NotificationOptions,
} from './interfaces/ContentUIInterfaces';

export class ContentUIElementFactory implements IContentUIElementFactory {
  public createUploadButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.setAttribute('data-github-upload', 'true');
    button.setAttribute('data-testid', 'github-upload-button');
    button.setAttribute('aria-haspopup', 'menu');
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
      'transition-opacity',
    ].join(' ');

    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 2px;">
        <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
      </svg>
      GitHub
      <svg width="12" height="12" viewBox="0 0 24 24" style="margin-left: 4px;">
        <path fill="currentColor" d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z"/>
      </svg>
    `;

    return button;
  }

  public createGitHubDropdown(): HTMLElement {
    const dropdownContent = document.createElement('div');
    dropdownContent.id = 'github-dropdown-content';
    dropdownContent.setAttribute('role', 'menu');
    dropdownContent.className = [
      'rounded-md',
      'shadow-lg',
      'overflow-hidden',
      'min-w-[180px]',
      'animate-fadeIn',
    ].join(' ');

    // Add some custom styles for animation and better appearance
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-fadeIn {
        animation: fadeIn 0.2s ease-out forwards;
      }
      #github-dropdown-content {
        background-color: #1a1a1a; /* Match the Export dropdown background */
        border: none;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        position: fixed; /* Use fixed positioning to avoid scroll issues */
        z-index: 9999;
      }
      #github-dropdown-content button {
        color: #ffffff;
        padding: 8px 16px;
        width: 100%;
        text-align: left;
        border: none;
        background: transparent;
        font-size: 12px;
      }
      #github-dropdown-content button:hover {
        background-color: #333333; /* Match the Export dropdown hover state */
      }
      #github-dropdown-content button svg {
        transition: transform 0.15s ease;
        margin-right: 8px;
      }
      #github-dropdown-content button:hover svg {
        transform: scale(1.05);
      }
      /* Remove border between items to match Export dropdown */
      #github-dropdown-content button:first-child {
        border-bottom: none;
      }
    `;
    document.head.appendChild(style);

    // Push option
    const pushButton = document.createElement('button');
    pushButton.className = 'dropdown-item flex items-center';
    pushButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </svg>
      <span>Push to GitHub</span>
    `;

    // Show Changed Files option
    const changedFilesButton = document.createElement('button');
    changedFilesButton.className = 'dropdown-item flex items-center';
    changedFilesButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="9" y1="15" x2="15" y2="15"></line>
      </svg>
      <span>Show Changed Files</span>
    `;

    // Settings option
    const settingsButton = document.createElement('button');
    settingsButton.className = 'dropdown-item flex items-center';
    settingsButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      <span>Settings</span>
    `;

    dropdownContent.appendChild(pushButton);
    dropdownContent.appendChild(changedFilesButton);
    dropdownContent.appendChild(settingsButton);

    return dropdownContent;
  }

  public createNotificationElement(options: NotificationOptions): HTMLElement {
    const notification = document.createElement('div');
    notification.className = [
      'fixed',
      'top-4',
      'right-4',
      'p-4',
      options.type === 'error'
        ? 'bg-red-500'
        : options.type === 'success'
          ? 'bg-green-500'
          : 'bg-blue-500',
      'text-white',
      'rounded-md',
      'shadow-lg',
      'flex',
      'items-center',
      'gap-2',
      'text-sm',
      'z-[10000]',
    ].join(' ');

    // Icon based on notification type
    let icon = '';
    if (options.type === 'error') {
      icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>`;
    } else if (options.type === 'success') {
      icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>`;
    } else {
      icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>`;
    }

    notification.innerHTML = `
      ${icon}
      <span>${options.message}</span>
    `;

    // Add close button
    const closeButton = document.createElement('button');
    closeButton.className = 'ml-2 text-white hover:text-white/90 font-medium text-lg leading-none';
    closeButton.innerHTML = '×';
    notification.appendChild(closeButton);

    return notification;
  }

  public createUploadStatusContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'bolt-to-github-upload-status-container';
    container.style.zIndex = '10000'; // Ensure high z-index
    container.style.position = 'fixed'; // Use fixed positioning
    container.style.top = '20px'; // Position at the top of the viewport
    container.style.right = '20px'; // Position at the right of the viewport
    return container;
  }

  public createGitHubConfirmationDialog(
    projectSettings: Record<string, { repoName: string; branch: string }>
  ): HTMLElement {
    const overlay = document.createElement('div');
    overlay.style.zIndex = '9999';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.className = ['fixed', 'inset-0', 'flex', 'items-center', 'justify-center'].join(' ');

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
      'relative',
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
    return overlay;
  }
}
