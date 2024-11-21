import UploadStatus from './UploadStatus.svelte';

console.log('🚀 Upload status content script loading...');

let app: UploadStatus | null = null;

function initializeUI() {
  // Clean up existing instance if any
  if (app) {
    app.$destroy();
    app = null;
  }

  // Remove existing container if any
  const existingContainer = document.getElementById('bolt-upload-status-container');
  if (existingContainer) {
    existingContainer.remove();
  }

  // Create new container and component
  const target = document.createElement('div');
  target.id = 'bolt-upload-status-container';
  document.body.appendChild(target);

  app = new UploadStatus({
    target
  });
}

// Initialize UI
initializeUI();

// Cleanup on navigation
window.addEventListener('unload', () => {
  if (app) {
    app.$destroy();
    app = null;
  }
});

// Re-initialize on extension update or reload
chrome.runtime.onConnect.addListener(() => {
  initializeUI();
});
