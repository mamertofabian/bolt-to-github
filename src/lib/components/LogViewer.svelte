<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getLogStorage, clearLogs, exportLogsForBugReport } from '$lib/utils/logger';
  import type { LogEntry } from '$lib/utils/logStorage';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Badge } from '$lib/components/ui/badge';
  import { X } from 'lucide-svelte';

  let logs: LogEntry[] = [];
  let filteredLogs: LogEntry[] = [];
  let searchTerm = '';
  let debouncedSearchTerm = '';
  let searchDebounceTimeout: number | null = null;
  let selectedLevel: string = 'all';
  let selectedContext: string = 'all';
  let autoRefresh = true;
  let refreshInterval: number | null = null;
  let isExporting = false;
  let autoScroll = true;
  let logsContainer: HTMLDivElement;
  let isUserScrolling = false;
  let scrollTimeout: number | null = null;

  const levelColors = {
    debug: 'bg-gray-600 dark:bg-gray-500',
    info: 'bg-blue-600 dark:bg-blue-500',
    warn: 'bg-yellow-600 dark:bg-yellow-500',
    error: 'bg-red-600 dark:bg-red-500',
  };

  const contextColors = {
    background: 'bg-purple-600 dark:bg-purple-500',
    content: 'bg-green-600 dark:bg-green-500',
    popup: 'bg-indigo-600 dark:bg-indigo-500',
    unknown: 'bg-gray-600 dark:bg-gray-500',
  };

  async function loadLogs() {
    const logStorage = getLogStorage();
    logs = await logStorage.getAllLogs();
    applyFilters();

    // Auto-scroll to bottom if enabled and user is not manually scrolling
    if (autoScroll && !isUserScrolling && logsContainer) {
      setTimeout(() => {
        scrollToBottom();
      }, 50);
    }
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
      if (debouncedSearchTerm) {
        const searchLower = debouncedSearchTerm.toLowerCase();
        return (
          log.message.toLowerCase().includes(searchLower) ||
          log.module.toLowerCase().includes(searchLower) ||
          (log.data && JSON.stringify(log.data).toLowerCase().includes(searchLower))
        );
      }

      return true;
    });

    // Sort by timestamp ascending (oldest first, newest at bottom)
    filteredLogs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
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

  function toggleAutoScroll() {
    autoScroll = !autoScroll;
    if (autoScroll) {
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    if (logsContainer) {
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
  }

  function clearSearch() {
    searchTerm = '';
    debouncedSearchTerm = '';
  }

  function handleSearchInput() {
    // Clear existing timeout
    if (searchDebounceTimeout) {
      clearTimeout(searchDebounceTimeout);
    }

    // Set new timeout for debounce (300ms)
    searchDebounceTimeout = window.setTimeout(() => {
      debouncedSearchTerm = searchTerm;
    }, 300);
  }

  function handleScroll() {
    if (!logsContainer) return;

    // Check if user is at the bottom (with 50px tolerance)
    const isAtBottom =
      logsContainer.scrollHeight - logsContainer.scrollTop - logsContainer.clientHeight < 50;

    // If user scrolled up manually, disable auto-scroll temporarily
    if (!isAtBottom) {
      isUserScrolling = true;

      // Clear existing timeout
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }

      // Re-enable auto-scroll after 5 seconds of no scrolling if auto-scroll is on
      if (autoScroll) {
        scrollTimeout = window.setTimeout(() => {
          isUserScrolling = false;
        }, 5000);
      }
    } else {
      isUserScrolling = false;
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
    if (searchDebounceTimeout) {
      clearTimeout(searchDebounceTimeout);
    }
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
  });

  // React to filter changes
  $: if (selectedLevel || selectedContext || debouncedSearchTerm) applyFilters();

  // React to search term changes
  $: if (searchTerm !== undefined) handleSearchInput();
</script>

<div class="log-viewer p-4 h-full flex flex-col bg-slate-900 text-slate-100">
  <div class="header mb-4">
    <h2 class="text-2xl font-bold mb-4 text-slate-100">Bolt to GitHub - Log Viewer</h2>

    <!-- Controls -->
    <div class="controls flex flex-wrap gap-2 mb-4">
      <div class="relative">
        <Input
          type="text"
          placeholder="Search logs..."
          bind:value={searchTerm}
          class="w-64 bg-slate-800 border-slate-700 text-slate-200 placeholder-slate-500 pr-8"
        />
        {#if searchTerm}
          <button
            on:click={clearSearch}
            class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        {/if}
      </div>

      <select
        bind:value={selectedLevel}
        class="px-3 py-2 border border-slate-700 rounded-md bg-slate-800 text-slate-200 focus:border-blue-500 focus:outline-none"
      >
        <option value="all">All Levels</option>
        <option value="debug">Debug</option>
        <option value="info">Info</option>
        <option value="warn">Warn</option>
        <option value="error">Error</option>
      </select>

      <select
        bind:value={selectedContext}
        class="px-3 py-2 border border-slate-700 rounded-md bg-slate-800 text-slate-200 focus:border-blue-500 focus:outline-none"
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

      <Button on:click={toggleAutoScroll} variant={autoScroll ? 'default' : 'outline'}>
        {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
      </Button>

      <Button on:click={loadLogs} variant="outline">Refresh</Button>

      <Button on:click={handleExport} variant="outline" disabled={isExporting}>
        {isExporting ? 'Exporting...' : 'Export for Bug Report'}
      </Button>

      <Button on:click={handleDownloadText} variant="outline">Download as Text</Button>

      <Button on:click={handleClearLogs} variant="destructive">Clear All Logs</Button>
    </div>

    <div class="stats text-sm text-slate-400">
      Showing {filteredLogs.length} of {logs.length} logs
    </div>
  </div>

  <!-- Log entries -->
  <div
    bind:this={logsContainer}
    on:scroll={handleScroll}
    class="logs-container flex-1 overflow-y-auto border border-slate-700 rounded-md p-2 bg-slate-800"
  >
    {#if filteredLogs.length === 0}
      <div class="text-center text-slate-500 py-8">No logs found</div>
    {:else}
      <div class="space-y-1">
        {#each filteredLogs as log}
          <div class="log-entry p-2 rounded hover:bg-slate-700 font-mono text-sm transition-colors">
            <div class="flex items-start gap-2">
              <span class="timestamp text-slate-500 whitespace-nowrap text-xs">
                {formatTimestamp(log.timestamp)}
              </span>

              <Badge class={`${levelColors[log.level]} text-white`}>
                {log.level.toUpperCase()}
              </Badge>

              <Badge class={`${contextColors[log.context]} text-white`}>
                {log.context}
              </Badge>

              <span class="module text-blue-400">
                [{log.module}]
              </span>

              <span class="message flex-1 text-slate-200">
                {log.message}
              </span>
            </div>

            {#if log.data}
              <div class="data mt-1 ml-4 text-slate-400 text-xs">
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
    border-left-color: #3b82f6;
  }

  /* Custom scrollbar for dark theme */
  .logs-container::-webkit-scrollbar {
    width: 8px;
  }

  .logs-container::-webkit-scrollbar-track {
    background: #1e293b;
    border-radius: 4px;
  }

  .logs-container::-webkit-scrollbar-thumb {
    background: #475569;
    border-radius: 4px;
  }

  .logs-container::-webkit-scrollbar-thumb:hover {
    background: #64748b;
  }
</style>
