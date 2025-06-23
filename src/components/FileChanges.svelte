<script lang="ts">
  import type { FileChange } from '../services/FilePreviewService';
  import { Button } from '$lib/components/ui/button';
  import { Eye } from 'lucide-svelte';
  import DiffViewer from '$lib/components/DiffViewer.svelte';

  // Props
  export let changes: Map<string, FileChange>;

  // Derived state
  $: addedFiles = Array.from(changes.values()).filter((file) => file.status === 'added');
  $: modifiedFiles = Array.from(changes.values()).filter((file) => file.status === 'modified');
  $: deletedFiles = Array.from(changes.values()).filter((file) => file.status === 'deleted');
  $: unchangedFiles = Array.from(changes.values()).filter((file) => file.status === 'unchanged');

  // State
  let activeTab = 'changed';
  let showUnchanged = false;
  let showDiffViewer = false;
  let selectedFilePath = '';

  // Computed values
  $: changedCount = addedFiles.length + modifiedFiles.length + deletedFiles.length;
  $: totalCount = changedCount + unchangedFiles.length;

  // Get icon for file status
  function getStatusIcon(status: string): string {
    switch (status) {
      case 'added':
        return '➕';
      case 'modified':
        return '✏️';
      case 'deleted':
        return '❌';
      case 'unchanged':
        return '✓';
      default:
        return '';
    }
  }

  // Format file path for display
  function formatPath(path: string): string {
    // Remove project/ prefix if it exists
    return path.replace(/^project\//, '');
  }

  // Function to handle viewing the diff
  function viewFileDiff(path: string) {
    selectedFilePath = path;
    showDiffViewer = true;
  }

  // No need for keyboard shortcuts as the modal handles Escape key
</script>

<div class="file-changes-container">
  <div class="file-changes-tabs">
    <div class="file-changes-summary">
      <span class="file-count text-xs">{changedCount} changed files (of {totalCount} total)</span>
    </div>
    <div class="tabs-wrapper">
      <button
        class="tab-button {activeTab === 'changed' ? 'active' : ''}"
        on:click={() => (activeTab = 'changed')}
      >
        Changed ({changedCount})
      </button>
      <button
        class="tab-button {activeTab === 'all' ? 'active' : ''}"
        on:click={() => (activeTab = 'all')}
      >
        All Files ({totalCount})
      </button>
    </div>
  </div>

  <div class="file-changes-content">
    {#if activeTab === 'changed'}
      {#if changedCount === 0}
        <div class="empty-state">
          <p>No changes detected. Your files are up to date.</p>
        </div>
      {:else}
        {#if addedFiles.length > 0}
          <div class="file-section">
            <h3 class="text-green-500">Added ({addedFiles.length})</h3>
            <ul class="file-list">
              {#each addedFiles as file}
                <li class="file-item">
                  <div class="flex items-center justify-between w-full">
                    <div class="flex items-center">
                      <span class="file-icon text-green-500">{getStatusIcon(file.status)}</span>
                      <span class="file-path">{formatPath(file.path)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-6 px-2 ml-2 text-xs"
                      title="View changes"
                      on:click={() => viewFileDiff(file.path)}
                    >
                      <Eye class="h-3 w-3 mr-1" />
                      Diff
                    </Button>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if modifiedFiles.length > 0}
          <div class="file-section">
            <h3 class="text-blue-500">Modified ({modifiedFiles.length})</h3>
            <ul class="file-list">
              {#each modifiedFiles as file}
                <li class="file-item">
                  <div class="flex items-center justify-between w-full">
                    <div class="flex items-center">
                      <span class="file-icon text-blue-500">{getStatusIcon(file.status)}</span>
                      <span class="file-path">{formatPath(file.path)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-6 px-2 ml-2 text-xs"
                      title="View changes"
                      on:click={() => viewFileDiff(file.path)}
                    >
                      <Eye class="h-3 w-3 mr-1" />
                      Diff
                    </Button>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if deletedFiles.length > 0}
          <div class="file-section">
            <h3 class="text-red-500">Deleted ({deletedFiles.length})</h3>
            <ul class="file-list">
              {#each deletedFiles as file}
                <li class="file-item">
                  <div class="flex items-center justify-between w-full">
                    <div class="flex items-center">
                      <span class="file-icon text-red-500">{getStatusIcon(file.status)}</span>
                      <span class="file-path">{formatPath(file.path)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-6 px-2 ml-2 text-xs"
                      title="View changes"
                      on:click={() => viewFileDiff(file.path)}
                    >
                      <Eye class="h-3 w-3 mr-1" />
                      Diff
                    </Button>
                  </div>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      {/if}
    {:else if activeTab === 'all'}
      <div class="file-section">
        <div class="show-unchanged-toggle">
          <label>
            <input type="checkbox" bind:checked={showUnchanged} />
            Show unchanged files ({unchangedFiles.length})
          </label>
        </div>

        {#if addedFiles.length > 0}
          <h3 class="text-green-500">Added ({addedFiles.length})</h3>
          <ul class="file-list">
            {#each addedFiles as file}
              <li class="file-item">
                <div class="flex items-center justify-between w-full">
                  <div class="flex items-center">
                    <span class="file-icon text-green-500">{getStatusIcon(file.status)}</span>
                    <span class="file-path">{formatPath(file.path)}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-6 px-2 ml-2 text-xs"
                    title="View changes"
                    on:click={() => viewFileDiff(file.path)}
                  >
                    <Eye class="h-3 w-3 mr-1" />
                    Diff
                  </Button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}

        {#if modifiedFiles.length > 0}
          <h3 class="text-blue-500">Modified ({modifiedFiles.length})</h3>
          <ul class="file-list">
            {#each modifiedFiles as file}
              <li class="file-item">
                <div class="flex items-center justify-between w-full">
                  <div class="flex items-center">
                    <span class="file-icon text-blue-500">{getStatusIcon(file.status)}</span>
                    <span class="file-path">{formatPath(file.path)}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-6 px-2 ml-2 text-xs"
                    title="View changes"
                    on:click={() => viewFileDiff(file.path)}
                  >
                    <Eye class="h-3 w-3 mr-1" />
                    Diff
                  </Button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}

        {#if deletedFiles.length > 0}
          <h3 class="text-red-500">Deleted ({deletedFiles.length})</h3>
          <ul class="file-list">
            {#each deletedFiles as file}
              <li class="file-item">
                <div class="flex items-center justify-between w-full">
                  <div class="flex items-center">
                    <span class="file-icon text-red-500">{getStatusIcon(file.status)}</span>
                    <span class="file-path">{formatPath(file.path)}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-6 px-2 ml-2 text-xs"
                    title="View changes"
                    on:click={() => viewFileDiff(file.path)}
                  >
                    <Eye class="h-3 w-3 mr-1" />
                    Diff
                  </Button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}

        {#if showUnchanged && unchangedFiles.length > 0}
          <h3 class="text-gray-500">Unchanged ({unchangedFiles.length})</h3>
          <ul class="file-list">
            {#each unchangedFiles as file}
              <li class="file-item">
                <div class="flex items-center justify-between w-full">
                  <div class="flex items-center">
                    <span class="file-icon text-gray-500">{getStatusIcon(file.status)}</span>
                    <span class="file-path">{formatPath(file.path)}</span>
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- Add the DiffViewer component -->
<DiffViewer
  bind:show={showDiffViewer}
  path={selectedFilePath}
  fileChange={changes.get(selectedFilePath)}
/>

<style>
  .file-changes-container {
    background-color: #111827;
    color: #e5e7eb;
    border-radius: 4px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;
  }

  .file-changes-summary {
    font-size: 0.75rem;
    color: #94a3b8;
    padding: 0.5rem 0.75rem;
  }

  .file-changes-tabs {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid #1e293b;
  }

  .tabs-wrapper {
    display: flex;
  }

  .tab-button {
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 0.75rem;
    position: relative;
    transition: all 0.2s ease;
  }

  .tab-button.active {
    color: #e5e7eb;
    background-color: #1e293b;
  }

  .tab-button.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background-color: #3b82f6;
  }

  .tab-button:hover {
    color: #e5e7eb;
    background-color: #1e293b;
  }

  .file-changes-content {
    padding: 0.5rem 0.75rem;
    overflow-y: auto;
    flex: 1;
    background-color: #111827;
  }

  .file-section {
    margin-bottom: 0.75rem;
  }

  .file-section h3 {
    font-size: 0.75rem;
    font-weight: 500;
    margin: 0 0 0.25rem 0;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid #1e293b;
  }

  .file-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .file-item {
    display: flex;
    align-items: center;
    padding: 0.125rem 0;
    font-size: 0.75rem;
    width: 100%;
  }

  .file-icon {
    margin-right: 0.5rem;
    min-width: 1rem;
    display: inline-flex;
    justify-content: center;
  }

  .file-path {
    word-break: break-all;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.7rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    color: #94a3b8;
    text-align: center;
    font-size: 0.75rem;
  }

  .show-unchanged-toggle {
    margin-bottom: 0.75rem;
    font-size: 0.75rem;
    color: #94a3b8;
    display: flex;
    align-items: center;
  }

  .show-unchanged-toggle input {
    margin-right: 0.5rem;
  }

  .text-green-500 {
    color: #10b981;
  }

  .text-blue-500 {
    color: #3b82f6;
  }

  .text-red-500 {
    color: #ef4444;
  }

  .text-gray-500 {
    color: #64748b;
  }
</style>
