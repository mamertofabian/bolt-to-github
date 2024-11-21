import UploadStatus from './UploadStatus.svelte';

console.log('🚀 Upload status content script loading...');

// Create a container for the Svelte component
const target = document.createElement('div');
target.id = 'bolt-upload-status-container';
document.body.appendChild(target);

// Initialize the Svelte component
const app = new UploadStatus({
  target
});

// Cleanup on navigation
window.addEventListener('unload', () => {
  app.$destroy();
});

export default app;
