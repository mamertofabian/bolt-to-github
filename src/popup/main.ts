import '../styles/gb.css';
import App from './App.svelte';

// Track popup opening via background script
chrome.runtime.sendMessage({
  type: 'ANALYTICS_EVENT',
  eventType: 'page_view',
  eventData: {
    page: 'popup',
    metadata: { timestamp: new Date().toISOString() },
  },
});

const app = new App({
  target: document.getElementById('app')!,
});

export default app;
