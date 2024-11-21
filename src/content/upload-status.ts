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
      <div class="bolt-notification hidden fixed bottom-4 right-4 w-80 bg-white rounded-lg shadow-lg border p-4 z-50">
        <div class="flex items-center justify-between mb-2">
          <span class="font-medium status-text">Uploading to GitHub...</span>
          <span class="text-sm text-gray-600 progress-percent"></span>
        </div>
        
        <div class="w-full bg-gray-200 rounded-full h-2.5 mb-2">
          <div class="progress-bar bg-blue-500 h-2.5 rounded-full transition-all duration-300" style="width: 0%"></div>
        </div>
        
        <p class="status-message text-sm text-gray-600"></p>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .bolt-notification {
        transition: all 0.3s ease-in-out;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
      }
      .bolt-notification.hidden {
        transform: translateY(150%);
        opacity: 0;
      }
      .progress-bar {
        transition: width 0.3s ease-in-out;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(container);
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
      statusText.className = 'font-medium status-text text-blue-600';
      progressBar.className = 'progress-bar bg-blue-500 h-2.5 rounded-full transition-all duration-300';
    } else if (status === 'success') {
      statusText.textContent = 'Upload Complete!';
      statusText.className = 'font-medium status-text text-green-600';
      progressBar.className = 'progress-bar bg-green-500 h-2.5 rounded-full transition-all duration-300';
    } else if (status === 'error') {
      statusText.textContent = 'Upload Failed';
      statusText.className = 'font-medium status-text text-red-600';
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
