<script lang="ts">
  import type { FileChange } from '../services/FilePreviewService';
  import { onMount } from 'svelte';

  // Props
  export let changes: Map<string, FileChange>;

  // Derived state
  $: addedFiles = Array.from(changes.values()).filter(file => file.status === 'added');
  $: modifiedFiles = Array.from(changes.values()).filter(file => file.status === 'modified');
  $: deletedFiles = Array.from(changes.values()).filter(file => file.status === 'deleted');
  $: unchangedFiles = Array.from(changes.values()).filter(file => file.status === 'unchanged');

  // State
  let activeTab = 'changed';
  let showUnchanged = false;

  // Computed values
  $: changedCount = addedFiles.length + modifiedFiles.length + deletedFiles.length;
  $: totalCount = changedCount + unchangedFiles.length;

  // Get icon for file status
  function getStatusIcon(status: string): string {
    switch (status) {
      case 'added': return '➕';
      case 'modified': return '✏️';
      case 'deleted': return '❌';
      case 'unchanged': return '✓';
      default: return '';
    }
  }

  // Get color class for file status
  function getStatusColorClass(status: string): string {
    switch (status) {
      case 'added': return 'text-green-500';
      case 'modified': return 'text-blue-500';
      case 'deleted': return 'text-red-500';
      case 'unchanged': return 'text-gray-500';
      default: return '';
    }
  }

  // Format file path for display
  function formatPath(path: string): string {
    // Remove project/ prefix if it exists
    return path.replace(/^project\//, '');
  }

  // No need for keyboard shortcuts as the modal handles Escape key
</script>

<div class="file-changes-container">
  <div class="file-changes-header">
    <h2>File Changes</h2>
    <div class="file-changes-summary">
      <span class="file-count">{changedCount} changed files (of {totalCount} total)</span>
    </div>

  </div>
  
  <div class="file-changes-tabs">
    <button 
      class="tab-button {activeTab === 'changed' ? 'active' : ''}"
      on:click={() => activeTab = 'changed'}
    >
      Changed ({changedCount})
    </button>
    <button 
      class="tab-button {activeTab === 'all' ? 'active' : ''}"
      on:click={() => activeTab = 'all'}
    >
      All Files ({totalCount})
    </button>
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
                  <span class="file-icon text-green-500">{getStatusIcon(file.status)}</span>
                  <span class="file-path">{formatPath(file.path)}</span>
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
                  <span class="file-icon text-blue-500">{getStatusIcon(file.status)}</span>
                  <span class="file-path">{formatPath(file.path)}</span>
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
                  <span class="file-icon text-red-500">{getStatusIcon(file.status)}</span>
                  <span class="file-path">{formatPath(file.path)}</span>
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
            <input type="checkbox" bind:checked={showUnchanged}>
            Show unchanged files ({unchangedFiles.length})
          </label>
        </div>
        
        {#if addedFiles.length > 0}
          <h3 class="text-green-500">Added ({addedFiles.length})</h3>
          <ul class="file-list">
            {#each addedFiles as file}
              <li class="file-item">
                <span class="file-icon text-green-500">{getStatusIcon(file.status)}</span>
                <span class="file-path">{formatPath(file.path)}</span>
              </li>
            {/each}
          </ul>
        {/if}
        
        {#if modifiedFiles.length > 0}
          <h3 class="text-blue-500">Modified ({modifiedFiles.length})</h3>
          <ul class="file-list">
            {#each modifiedFiles as file}
              <li class="file-item">
                <span class="file-icon text-blue-500">{getStatusIcon(file.status)}</span>
                <span class="file-path">{formatPath(file.path)}</span>
              </li>
            {/each}
          </ul>
        {/if}
        
        {#if deletedFiles.length > 0}
          <h3 class="text-red-500">Deleted ({deletedFiles.length})</h3>
          <ul class="file-list">
            {#each deletedFiles as file}
              <li class="file-item">
                <span class="file-icon text-red-500">{getStatusIcon(file.status)}</span>
                <span class="file-path">{formatPath(file.path)}</span>
              </li>
            {/each}
          </ul>
        {/if}
        
        {#if showUnchanged && unchangedFiles.length > 0}
          <h3 class="text-gray-500">Unchanged ({unchangedFiles.length})</h3>
          <ul class="file-list">
            {#each unchangedFiles as file}
              <li class="file-item">
                <span class="file-icon text-gray-500">{getStatusIcon(file.status)}</span>
                <span class="file-path">{formatPath(file.path)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .file-changes-container {
    background-color: #1a1a1a;
    color: #ffffff;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;
  }
  
  .file-changes-header {
    padding: 16px;
    border-bottom: 1px solid #333;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  
  .file-changes-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
  
  .file-changes-summary {
    font-size: 14px;
    color: #aaa;
    margin-left: auto;
  }
  
  .file-changes-tabs {
    display: flex;
    border-bottom: 1px solid #333;
  }
  
  .tab-button {
    padding: 12px 16px;
    background: transparent;
    border: none;
    color: #aaa;
    cursor: pointer;
    font-size: 14px;
    position: relative;
  }
  
  .tab-button.active {
    color: #fff;
  }
  
  .tab-button.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background-color: #4a9eff;
  }
  
  .tab-button:hover {
    color: #fff;
    background-color: rgba(255, 255, 255, 0.05);
  }
  
  .file-changes-content {
    padding: 16px;
    overflow-y: auto;
    flex: 1;
  }
  
  .file-section {
    margin-bottom: 24px;
  }
  
  .file-section h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 8px 0;
    padding-bottom: 4px;
    border-bottom: 1px solid #333;
  }
  
  .file-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  
  .file-item {
    display: flex;
    align-items: center;
    padding: 4px 0;
    font-size: 13px;
  }
  
  .file-icon {
    margin-right: 8px;
    width: 16px;
    display: inline-flex;
    justify-content: center;
  }
  
  .file-path {
    word-break: break-all;
  }
  
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    color: #aaa;
    text-align: center;
  }
  
  .show-unchanged-toggle {
    margin-bottom: 16px;
    font-size: 13px;
    color: #aaa;
    display: flex;
    align-items: center;
  }
  
  .show-unchanged-toggle input {
    margin-right: 8px;
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
    color: #9ca3af;
  }
</style>
