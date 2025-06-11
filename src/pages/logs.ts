import '../styles/gb.css';
import LogViewer from '../lib/components/LogViewer.svelte';

const app = new LogViewer({
  target: document.getElementById('app')!,
});

export default app;
