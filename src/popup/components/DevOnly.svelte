<script lang="ts">
  import GitHubSettingsApp from './GitHubSettingsApp.svelte';
  import GitHubSettingsPat from './GitHubSettingsPat.svelte';

  let showGitHubSettingsApp = false;
  let showGitHubSettingsPat = false;
</script>

<!-- GitHub Apps Integration Test -->
<div class="github-app-testing-section">
  <div class="section-header">
    <div class="header-content">
      <div class="header-text">
        <h3 class="text-sm font-medium text-slate-200">🔧 GitHub App Testing</h3>
        <p class="text-xs text-slate-400">
          Test GitHub App functionality and API access (Development Only)
        </p>
      </div>
      <button
        class="collapse-toggle"
        on:click={() => (showGitHubSettingsApp = !showGitHubSettingsApp)}
        aria-label={showGitHubSettingsApp ? 'Collapse' : 'Expand'}
      >
        <svg
          class="toggle-icon {showGitHubSettingsApp ? 'expanded' : ''}"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
  </div>

  {#if showGitHubSettingsApp}
    <div class="collapsible-content">
      <GitHubSettingsApp />
    </div>
  {/if}
</div>

<!-- GitHub PAT Testing -->
<div class="github-pat-testing-section">
  <div class="section-header">
    <div class="header-content">
      <div class="header-text">
        <h3 class="text-sm font-medium text-slate-200">🔑 GitHub PAT Testing</h3>
        <p class="text-xs text-slate-400">
          Test Personal Access Token functionality and API access (Development Only)
        </p>
      </div>
      <button
        class="collapse-toggle"
        on:click={() => (showGitHubSettingsPat = !showGitHubSettingsPat)}
        aria-label={showGitHubSettingsPat ? 'Collapse' : 'Expand'}
      >
        <svg
          class="toggle-icon {showGitHubSettingsPat ? 'expanded' : ''}"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
  </div>

  {#if showGitHubSettingsPat}
    <div class="collapsible-content">
      <GitHubSettingsPat />
    </div>
  {/if}
</div>

<style>
  /* Collapsible GitHub App Testing Section */
  .github-app-testing-section {
    margin: 16px 0;
    padding: 12px;
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid #334155;
    border-radius: 8px;
  }

  /* Collapsible GitHub PAT Testing Section */
  .github-pat-testing-section {
    margin: 16px 0;
    padding: 12px;
    background: rgba(15, 23, 42, 0.5);
    border: 1px solid #334155;
    border-radius: 8px;
  }

  .section-header {
    margin-bottom: 0;
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .header-text {
    flex: 1;
  }

  .collapse-toggle {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    color: #64748b;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
  }

  .collapse-toggle:hover {
    background: rgba(51, 65, 85, 0.8);
    color: #e2e8f0;
  }

  .toggle-icon {
    transition: transform 0.2s ease;
  }

  .toggle-icon.expanded {
    transform: rotate(180deg);
  }

  .collapsible-content {
    margin-top: 12px;
    animation: fadeIn 0.2s ease;
  }
</style>
