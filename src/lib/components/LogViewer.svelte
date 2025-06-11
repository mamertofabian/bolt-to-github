<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getLogStorage, clearLogs, exportLogsForBugReport } from '$lib/utils/logger';
  import type { LogEntry } from '$lib/utils/logStorage';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';

  let logs: LogEntry[] = [];
  let filteredLogs: LogEntry[] = [];
  let searchTerm = '';
  let selectedLevel: string = 'all';
  let selectedContext: string = 'all';
  let autoRefresh = true;
  let refreshInterval: number | null = null;
  let isExporting = false;

  const levelColors = {
    debug: 'bg-gray-500',
    info: 'bg-blue-500',
    warn: 'bg-yellow-500',
    error: 'bg-red-500',
  };

  const contextColors = {
    background: 'bg-purple-500',
    content: 'bg-green-500',
    popup: 'bg-indigo-500',
    unknown: 'bg-gray-500',
  };

  async function loadLogs() {
    const logStorage = getLogStorage();
    logs = await logStorage.getAllLogs();
    applyFilters();
  }

  function applyFilters() {
    filteredLogs = logs.filter((log) => {
      // Level filter
      if (selectedLevel !== 'all' && log.level !== selectedLevel) {
        return false;
      }

      // Context filter
      if (selectedContext !== 'all' && log.context !== selectedContext) {
        return false;
      }

      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          log.message.toLowerCase().includes(searchLower) ||
          log.module.toLowerCase().includes(searchLower) ||
          (log.data && JSON.stringify(log.data).toLowerCase().includes(searchLower))
        );
      }

      return true;
    });

    // Sort by timestamp descending (newest first)
    filteredLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  async function handleClearLogs() {
    if (confirm('Are you sure you want to clear all logs?')) {
      await clearLogs();
      await loadLogs();
    }
  }

  async function handleExport() {
    isExporting = true;
    try {
      const exportData = await exportLogsForBugReport();

      // Create a blob with the export data
      const fullExport = {
        metadata: exportData.metadata,
        logs: exportData.logs,
      };

      const blob = new Blob([JSON.stringify(fullExport, null, 2)], {
        type: 'application/json',
      });

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bolt-to-github-logs-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      isExporting = false;
    }
  }

  function handleDownloadText() {
    const textContent = filteredLogs
      .map((log) => {
        const dataStr = log.data ? ` | Data: ${JSON.stringify(log.data)}` : '';
        return `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.context}] [${log.module}] ${log.message}${dataStr}`;
      })
      .join('\n');

    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bolt-to-github-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  function toggleAutoRefresh() {
    autoRefresh = !autoRefresh;
    if (autoRefresh) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  }

  function startAutoRefresh() {
    if (refreshInterval) return;
    refreshInterval = window.setInterval(() => {
      loadLogs();
    }, 2000); // Refresh every 2 seconds
  }

  function stopAutoRefresh() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  onMount(() => {
    loadLogs();
    if (autoRefresh) {
      startAutoRefresh();
    }
  });

  onDestroy(() => {
    stopAutoRefresh();
  });

  // React to filter changes
  $: selectedLevel, selectedContext, searchTerm, applyFilters();
</script>

<div class="log-viewer p-4 h-full flex flex-col">
  <div class="header mb-4">
    <h2 class="text-2xl font-bold mb-4">Log Viewer</h2>

    <!-- Controls -->
    <div class="controls flex flex-wrap gap-2 mb-4">
      <Input type="text" placeholder="Search logs..." bind:value={searchTerm} class="w-64" />

      <select
        bind:value={selectedLevel}
        class="px-3 py-2 border rounded-md bg-white dark:bg-gray-800"
      >
        <option value="all">All Levels</option>
        <option value="debug">Debug</option>
        <option value="info">Info</option>
        <option value="warn">Warn</option>
        <option value="error">Error</option>
      </select>

      <select
        bind:value={selectedContext}
        class="px-3 py-2 border rounded-md bg-white dark:bg-gray-800"
      >
        <option value="all">All Contexts</option>
        <option value="background">Background</option>
        <option value="content">Content</option>
        <option value="popup">Popup</option>
        <option value="unknown">Unknown</option>
      </select>

      <Button on:click={toggleAutoRefresh} variant={autoRefresh ? 'default' : 'outline'}>
        {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
      </Button>

      <Button on:click={loadLogs} variant="outline">Refresh</Button>

      <Button on:click={handleExport} variant="outline" disabled={isExporting}>
        {isExporting ? 'Exporting...' : 'Export for Bug Report'}
      </Button>

      <Button on:click={handleDownloadText} variant="outline">Download as Text</Button>

      <Button on:click={handleClearLogs} variant="destructive">Clear All Logs</Button>
    </div>

    <div class="stats text-sm text-gray-600 dark:text-gray-400">
      Showing {filteredLogs.length} of {logs.length} logs
    </div>
  </div>

  <!-- Log entries -->
  <div
    class="logs-container flex-1 overflow-y-auto border rounded-md p-2 bg-gray-50 dark:bg-gray-900"
  >
    {#if filteredLogs.length === 0}
      <div class="text-center text-gray-500 py-8">No logs found</div>
    {:else}
      <div class="space-y-1">
        {#each filteredLogs as log}
          <div
            class="log-entry p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 font-mono text-sm"
          >
            <div class="flex items-start gap-2">
              <span class="timestamp text-gray-500 whitespace-nowrap">
                {formatTimestamp(log.timestamp)}
              </span>

              <Badge class={`${levelColors[log.level]} text-white`}>
                {log.level.toUpperCase()}
              </Badge>

              <Badge class={`${contextColors[log.context]} text-white`}>
                {log.context}
              </Badge>

              <span class="module text-blue-600 dark:text-blue-400">
                [{log.module}]
              </span>

              <span class="message flex-1">
                {log.message}
              </span>
            </div>

            {#if log.data}
              <div class="data mt-1 ml-4 text-gray-600 dark:text-gray-400 text-xs">
                Data: {JSON.stringify(log.data)}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .log-viewer {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  }

  .logs-container {
    max-height: calc(100vh - 250px);
  }

  .log-entry {
    border-left: 3px solid transparent;
    transition: all 0.2s ease;
  }

  .log-entry:hover {
    border-left-color: var(--color-primary);
  }
</style>
