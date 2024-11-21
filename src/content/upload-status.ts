console.log('🚀 Upload status content script loading...');

class UploadStatusUI {
  private container: HTMLElement;

  constructor() {
    console.log('🏗️ Initializing upload status UI...');
    this.container = this.createNotificationUI();
    this.initializeMessageListener();
    this.announceReady();
  }

  private createNotificationUI(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'bolt-upload-status';
    container.innerHTML = `
      <div class="bolt-notification hidden fixed top-4 right-4 w-80 bg-gray-800/100 rounded-lg shadow-lg border border-gray-700 p-4 z-50">
        <div class="flex items-center justify-between mb-2">
          <span class="font-medium status-text text-gray-100">Uploading to GitHub...</span>
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-300 progress-percent"></span>
            <button class="close-button text-gray-400 hover:text-gray-200 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
        
        <div class="w-full bg-gray-700 rounded-full h-2.5 mb-2">
          <div class="progress-bar bg-blue-500 h-2.5 rounded-full transition-all duration-300" style="width: 0%"></div>
        </div>
        
        <p class="status-message text-sm text-gray-300"></p>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .bolt-notification {
        transition: all 0.3s ease-in-out;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
        backdrop-filter: none;
        background-color: rgb(31, 41, 55);
      }
      .bolt-notification.hidden {
        transform: translateY(-150%);
        opacity: 0;
      }
      .progress-bar {
        transition: width 0.3s ease-in-out;
      }
      .close-button {
        cursor: pointer;
        padding: 2px;
        border-radius: 4px;
        line-height: 0;
      }
      .close-button:hover {
        background-color: rgba(255, 255, 255, 0.1);
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(container);

    // Add close button event listener
    const closeButton = container.querySelector('.close-button');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        const notification = container.querySelector('.bolt-notification');
        if (notification) {
          notification.classList.add('hidden');
        }
      });
    }

    console.log('📦 Notification UI created');
    return container;
  }

  private updateNotificationUI(status: string, progress: number, message: string) {
    console.log('🔄 Updating notification:', { status, progress, message });
    
    const notification = this.container.querySelector('.bolt-notification');
    const statusText = this.container.querySelector('.status-text');
    const progressBar = this.container.querySelector('.progress-bar');
    const progressPercent = this.container.querySelector('.progress-percent');
    const statusMessage = this.container.querySelector('.status-message');

    if (!notification || !statusText || !progressBar || !progressPercent || !statusMessage) {
      console.error('❌ Could not find UI elements');
      return;
    }

    // Show notification
    notification.classList.remove('hidden');

    // Update status text and color
    if (status === 'uploading') {
      statusText.textContent = 'Uploading to GitHub...';
      statusText.className = 'font-medium status-text text-gray-100';
      progressBar.className = 'progress-bar bg-blue-500 h-2.5 rounded-full transition-all duration-300';
    } else if (status === 'success') {
      statusText.textContent = 'Upload Complete!';
      statusText.className = 'font-medium status-text text-green-400';
      progressBar.className = 'progress-bar bg-green-500 h-2.5 rounded-full transition-all duration-300';
    } else if (status === 'error') {
      statusText.textContent = 'Upload Failed';
      statusText.className = 'font-medium status-text text-red-400';
      progressBar.className = 'progress-bar bg-red-500 h-2.5 rounded-full transition-all duration-300';
    }

    // Update progress
    if (progressBar instanceof HTMLElement) {
      progressBar.style.width = `${progress}%`;
    }
    progressPercent.textContent = `${progress}%`;

    // Update message
    statusMessage.textContent = message;

    // Hide notification after success or error
    if (status === 'success' || status === 'error') {
      setTimeout(() => {
        notification.classList.add('hidden');
      }, 5000);
    }
  }

  private initializeMessageListener() {
    console.log('👂 Initializing message listener...');
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('📨 Received message:', message);
      if (message.type === 'UPLOAD_STATUS') {
        this.updateNotificationUI(
          message.status,
          message.progress || 0,
          message.message || ''
        );
        sendResponse({ received: true });
      }
      return true;
    });
  }

  private async announceReady() {
    try {
      await chrome.runtime.sendMessage({ type: 'CONTENT_SCRIPT_READY' });
      console.log('✅ Content script registered with background service');
    } catch (error) {
      console.error('❌ Failed to register content script:', error);
    }
  }
}

// Initialize the UI
console.log('🎬 Creating upload status UI instance...');
const uploadStatus = new UploadStatusUI();
console.log('✨ Upload status UI initialized');
