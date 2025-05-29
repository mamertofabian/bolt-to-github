<script lang="ts">
  import { onMount } from 'svelte';
  import { UnifiedGitHubAuthService } from '../../services/UnifiedGitHubAuthService';
  import type { AuthenticationStatus } from '../../services/UnifiedGitHubAuthService';

  let unifiedAuthService: UnifiedGitHubAuthService;
  let authStatus: AuthenticationStatus | null = null;
  let statusMessage = '';
  let loading = true;

  onMount(async () => {
    unifiedAuthService = UnifiedGitHubAuthService.getInstance();
    await loadAuthStatus();
  });

  async function loadAuthStatus() {
    try {
      loading = true;
      authStatus = await unifiedAuthService.getAuthenticationStatus();
      statusMessage = await unifiedAuthService.getAuthStatusMessage();
    } catch (error) {
      console.error('Error loading auth status:', error);
      statusMessage = '❌ Error loading authentication status';
    } finally {
      loading = false;
    }
  }

  async function handleSetupGitHubApp() {
    await unifiedAuthService.promptGitHubAppSetup();
  }

  async function handleRefresh() {
    await unifiedAuthService.forceRefresh();
    await loadAuthStatus();
  }

  function getStatusIcon(tokenType: string): string {
    switch (tokenType) {
      case 'github_app':
        return '🚀';
      case 'pat':
        return '🔑';
      default:
        return '❌';
    }
  }

  function getStatusColor(tokenType: string): string {
    switch (tokenType) {
      case 'github_app':
        return 'text-green-600 dark:text-green-400';
      case 'pat':
        return 'text-blue-600 dark:text-blue-400';
      default:
        return 'text-red-600 dark:text-red-400';
    }
  }

  function getRateLimitText(tokenType: string): string {
    switch (tokenType) {
      case 'github_app':
        return '15,000 requests/hour';
      case 'pat':
        return '5,000 requests/hour';
      default:
        return 'No rate limit';
    }
  }
</script>

<div class="github-auth-status">
  <div class="section-header">
    <h3>🔐 GitHub Authentication</h3>
    <p class="text-sm text-gray-600 dark:text-gray-400">Current authentication method and status</p>
  </div>

  {#if loading}
    <div class="loading-state">
      <div
        class="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full"
      ></div>
      <span class="text-sm text-gray-600 dark:text-gray-400">Loading authentication status...</span>
    </div>
  {:else if authStatus}
    <div class="auth-info">
      <!-- Current Status -->
      <div class="status-card">
        <div class="status-main">
          <div class="status-icon">
            {getStatusIcon(authStatus.currentTokenType)}
          </div>
          <div class="status-details">
            <div class="status-text {getStatusColor(authStatus.currentTokenType)}">
              {statusMessage}
            </div>
            {#if authStatus.currentTokenType !== 'none'}
              <div class="rate-limit-text">
                {getRateLimitText(authStatus.currentTokenType)}
              </div>
            {/if}
          </div>
        </div>

        <button class="refresh-btn" on:click={handleRefresh} title="Refresh authentication status">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      <!-- Authentication Methods -->
      <div class="auth-methods">
        <div class="method-item {authStatus.hasGitHubApp ? 'active' : 'inactive'}">
          <div class="method-icon">🚀</div>
          <div class="method-info">
            <div class="method-name">GitHub App</div>
            <div class="method-desc">15K/hour • Best performance</div>
          </div>
          <div class="method-status">
            {authStatus.hasGitHubApp ? '✅' : '⭕'}
          </div>
        </div>

        <div class="method-item {authStatus.hasPAT ? 'active' : 'inactive'}">
          <div class="method-icon">🔑</div>
          <div class="method-info">
            <div class="method-name">Personal Access Token</div>
            <div class="method-desc">5K/hour • Manual setup</div>
          </div>
          <div class="method-status">
            {authStatus.hasPAT ? '✅' : '⭕'}
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      {#if authStatus.shouldEncourageGitHubApp}
        <div class="action-section">
          <div class="recommendation">
            <div class="recommendation-icon">💡</div>
            <div class="recommendation-text">
              {#if !authStatus.hasGitHubApp && authStatus.hasPAT}
                Upgrade to GitHub App integration for 3x better rate limits!
              {:else if authStatus.userAuthenticated && !authStatus.hasGitHubApp}
                Set up GitHub App integration for the best experience.
              {:else}
                Sign up and set up GitHub App integration for optimal performance.
              {/if}
            </div>
          </div>

          <button class="setup-btn" on:click={handleSetupGitHubApp}>
            {#if authStatus.userAuthenticated}
              🚀 Set Up GitHub App
            {:else}
              🚀 Get Started
            {/if}
          </button>
        </div>
      {/if}
    </div>
  {:else}
    <div class="error-state">
      <div class="text-red-600 dark:text-red-400">Failed to load authentication status</div>
      <button class="retry-btn" on:click={loadAuthStatus}> Try Again </button>
    </div>
  {/if}
</div>

<style>
  .github-auth-status {
    padding: 16px;
    background: #f8fafc;
    border-radius: 8px;
    margin: 16px 0;
    border: 1px solid #e2e8f0;
  }

  /* Dark mode styles */
  @media (prefers-color-scheme: dark) {
    .github-auth-status {
      background: #1e293b;
      border-color: #334155;
    }
  }

  .section-header h3 {
    margin: 0 0 4px 0;
    color: #1e293b;
    font-size: 16px;
    font-weight: 600;
  }

  @media (prefers-color-scheme: dark) {
    .section-header h3 {
      color: #e2e8f0;
    }
  }

  .loading-state,
  .error-state {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    justify-content: center;
  }

  .auth-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .status-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
  }

  @media (prefers-color-scheme: dark) {
    .status-card {
      background: #334155;
      border-color: #475569;
    }
  }

  .status-main {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .status-icon {
    font-size: 20px;
  }

  .status-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .status-text {
    font-weight: 500;
    font-size: 14px;
  }

  .rate-limit-text {
    font-size: 12px;
    color: #6b7280;
  }

  @media (prefers-color-scheme: dark) {
    .rate-limit-text {
      color: #94a3b8;
    }
  }

  .refresh-btn {
    padding: 6px;
    border: none;
    background: transparent;
    color: #6b7280;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .refresh-btn:hover {
    background: #f3f4f6;
    color: #374151;
  }

  @media (prefers-color-scheme: dark) {
    .refresh-btn {
      color: #94a3b8;
    }

    .refresh-btn:hover {
      background: #475569;
      color: #e2e8f0;
    }
  }

  .auth-methods {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .method-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
  }

  .method-item.active {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }

  .method-item.inactive {
    background: #f9fafb;
    border-color: #e5e7eb;
  }

  @media (prefers-color-scheme: dark) {
    .method-item.active {
      background: #064e3b;
      border-color: #059669;
    }

    .method-item.inactive {
      background: #374151;
      border-color: #4b5563;
    }
  }

  .method-icon {
    font-size: 16px;
  }

  .method-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .method-name {
    font-weight: 500;
    font-size: 14px;
    color: #1e293b;
  }

  .method-desc {
    font-size: 12px;
    color: #6b7280;
  }

  @media (prefers-color-scheme: dark) {
    .method-name {
      color: #e2e8f0;
    }

    .method-desc {
      color: #94a3b8;
    }
  }

  .method-status {
    font-size: 14px;
  }

  .action-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    background: #fef3c7;
    border: 1px solid #fbbf24;
    border-radius: 6px;
  }

  @media (prefers-color-scheme: dark) {
    .action-section {
      background: #451a03;
      border-color: #92400e;
    }
  }

  .recommendation {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .recommendation-icon {
    font-size: 16px;
    margin-top: 2px;
  }

  .recommendation-text {
    font-size: 14px;
    color: #92400e;
    line-height: 1.4;
  }

  @media (prefers-color-scheme: dark) {
    .recommendation-text {
      color: #fbbf24;
    }
  }

  .setup-btn {
    padding: 10px 16px;
    background: #2563eb;
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
    align-self: flex-start;
  }

  .setup-btn:hover {
    background: #1d4ed8;
  }

  .retry-btn {
    padding: 6px 12px;
    background: #6b7280;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .retry-btn:hover {
    background: #4b5563;
  }

  .text-sm {
    font-size: 14px;
  }

  .text-gray-600 {
    color: #4b5563;
  }

  .text-gray-400 {
    color: #9ca3af;
  }

  .text-green-600 {
    color: #16a34a;
  }

  .text-green-400 {
    color: #4ade80;
  }

  .text-blue-600 {
    color: #2563eb;
  }

  .text-blue-400 {
    color: #60a5fa;
  }

  .text-red-600 {
    color: #dc2626;
  }

  .text-red-400 {
    color: #f87171;
  }

  @media (prefers-color-scheme: dark) {
    .text-gray-600 {
      color: #94a3b8;
    }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .w-4 {
    width: 1rem;
  }

  .h-4 {
    height: 1rem;
  }

  .border-2 {
    border-width: 2px;
  }

  .border-current {
    border-color: currentColor;
  }

  .border-t-transparent {
    border-top-color: transparent;
  }

  .rounded-full {
    border-radius: 9999px;
  }
</style>
