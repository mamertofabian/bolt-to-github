<script lang="ts">
  import { onMount } from 'svelte';
  import { GitHubAppsService } from '../../content/services/GitHubAppsService';
  import { SupabaseAuthService } from '../../content/services/SupabaseAuthService';
  import { SUPABASE_CONFIG } from '../../lib/constants/supabase';
  import premiumStatusStore, { isAuthenticated } from '../../lib/stores/premiumStore';

  let githubAppsService: GitHubAppsService;
  let supabaseAuthService: SupabaseAuthService;
  let authState: any = null;
  let githubIntegrations: any[] = [];
  let installationToken: any = null;
  let loading = false;
  let error = '';
  let successMessage = '';
  let testResults: any = null;

  // Use premiumStore for authentication status
  $: isUserAuthenticated = $isAuthenticated;
  $: premiumStatus = $premiumStatusStore;

  onMount(() => {
    githubAppsService = GitHubAppsService.getInstance();
    supabaseAuthService = SupabaseAuthService.getInstance();
    authState = supabaseAuthService.getAuthState();

    // Auto-load if authenticated
    if (isUserAuthenticated) {
      loadGitHubIntegrations();
    }
  });

  async function loadGitHubIntegrations() {
    if (!isUserAuthenticated) {
      error = 'User not authenticated';
      return;
    }

    loading = true;
    error = '';
    successMessage = '';

    try {
      // Get auth token
      const authToken = await getAuthToken();
      if (!authToken) {
        throw new Error('No authentication token available');
      }

      // Get user info from SupabaseAuthService since we need the user ID
      authState = supabaseAuthService.getAuthState();
      if (!authState?.user?.id) {
        throw new Error('No user ID available');
      }

      // Fetch GitHub integrations
      const response = await fetch(
        `${SUPABASE_CONFIG.URL}/rest/v1/github_integrations?select=github_username%2Cexpires_at%2Cinstallation_id%2Caccess_token&user_id=eq.${authState.user.id}&integration_type=eq.github_app`,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            apikey: SUPABASE_CONFIG.ANON_KEY,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        githubIntegrations = await response.json();
        successMessage = `Found ${githubIntegrations.length} GitHub App integration(s)`;
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Failed to fetch integrations: ${response.status} - ${errorData.message || 'Unknown error'}`
        );
      }
    } catch (err: any) {
      error = err.message;
      console.error('Error loading GitHub integrations:', err);
    } finally {
      loading = false;
    }
  }

  async function getInstallationToken() {
    loading = true;
    error = '';
    successMessage = '';

    try {
      installationToken = await githubAppsService.getInstallationToken();
      if (installationToken) {
        successMessage = 'Installation token retrieved successfully';
      } else {
        error = 'Failed to get installation token';
      }
    } catch (err: any) {
      error = err.message;
      console.error('Error getting installation token:', err);
    } finally {
      loading = false;
    }
  }

  async function testGitHubAPI() {
    if (!installationToken) {
      error = 'No installation token available. Get token first.';
      return;
    }

    loading = true;
    error = '';
    successMessage = '';
    testResults = null;

    try {
      // Test rate limit check
      const rateLimitInfo = await githubAppsService.checkRateLimit(
        installationToken.token,
        'installation'
      );

      // Test installation repositories (this endpoint works well with installation tokens)
      const reposResponse = await githubAppsService.apiRequest(
        'https://api.github.com/installation/repositories',
        {},
        'repo_intensive'
      );

      if (reposResponse.ok) {
        const reposData = await reposResponse.json();

        testResults = {
          rateLimit: rateLimitInfo,
          repositoriesData: reposData,
          apiCall: 'GET /installation/repositories',
          status: reposResponse.status,
        };
        successMessage = 'GitHub API test successful';
      } else {
        const reposError = await reposResponse.json().catch(() => ({}));
        throw new Error(
          `API test failed: ${reposResponse.status}. Error: ${JSON.stringify(reposError)}`
        );
      }
    } catch (err: any) {
      error = err.message;
      console.error('Error testing GitHub API:', err);
    } finally {
      loading = false;
    }
  }

  async function getAuthToken(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get(['supabaseToken']);
      return result.supabaseToken || null;
    } catch (error) {
      console.warn('Error getting auth token:', error);
      return null;
    }
  }

  function clearResults() {
    githubIntegrations = [];
    installationToken = null;
    testResults = null;
    error = '';
    successMessage = '';
  }
</script>

<div class="github-settings-app">
  <div class="section-header">
    <h3>🔧 GitHub Apps Integration Test</h3>
    <p class="text-sm text-gray-600">Test GitHub Apps workflow and API integration</p>
  </div>

  <!-- Auth Status -->
  <div class="auth-status mb-4">
    <div class="flex items-center gap-2">
      <div
        class="status-indicator {isUserAuthenticated ? 'authenticated' : 'unauthenticated'}"
      ></div>
      <span class="text-sm text-gray-700 dark:text-gray-300">
        {isUserAuthenticated ? `Authenticated (via premium store)` : 'Not authenticated'}
      </span>
    </div>
    {#if premiumStatus.isPremium}
      <div class="text-xs text-green-600 dark:text-green-400 mt-1">
        Premium: {premiumStatus.plan}
      </div>
    {/if}
  </div>

  <!-- Messages -->
  {#if error}
    <div class="error-message">{error}</div>
  {/if}
  {#if successMessage}
    <div class="success-message">{successMessage}</div>
  {/if}

  <!-- Controls -->
  <div class="controls">
    <div class="button-group">
      <button
        class="btn btn-primary"
        on:click={loadGitHubIntegrations}
        disabled={loading || !isUserAuthenticated}
      >
        {loading ? 'Loading...' : 'Load GitHub Integrations'}
      </button>

      <button class="btn btn-secondary" on:click={getInstallationToken} disabled={loading}>
        {loading ? 'Loading...' : 'Get Installation Token'}
      </button>

      <button
        class="btn btn-accent"
        on:click={testGitHubAPI}
        disabled={loading || !installationToken}
      >
        {loading ? 'Testing...' : 'Test GitHub API'}
      </button>

      <button class="btn btn-outline" on:click={clearResults} disabled={loading}>
        Clear Results
      </button>
    </div>
  </div>

  <!-- Results -->
  <div class="results">
    <!-- GitHub Integrations -->
    {#if githubIntegrations.length > 0}
      <div class="result-section">
        <h4>GitHub Integrations ({githubIntegrations.length})</h4>
        <div class="integration-list">
          {#each githubIntegrations as integration}
            <div class="integration-item">
              <div class="integration-header">
                <span class="username">@{integration.github_username}</span>
                <span class="installation-id">Installation: {integration.installation_id}</span>
              </div>
              <div class="integration-details">
                <div class="expires">
                  Expires: {new Date(integration.expires_at).toLocaleString()}
                </div>
                <div class="token">Token: {integration.access_token?.substring(0, 20)}...</div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Installation Token -->
    {#if installationToken}
      <div class="result-section">
        <h4>Installation Token</h4>
        <div class="token-info">
          <div class="token-row">
            <span class="label">Token:</span>
            <span class="value">{installationToken.token.substring(0, 30)}...</span>
          </div>
          <div class="token-row">
            <span class="label">Type:</span>
            <span class="value">{installationToken.type}</span>
          </div>
          <div class="token-row">
            <span class="label">Installation ID:</span>
            <span class="value">{installationToken.installation_id}</span>
          </div>
          <div class="token-row">
            <span class="label">Expires:</span>
            <span class="value">{new Date(installationToken.expires_at).toLocaleString()}</span>
          </div>
          <div class="token-row">
            <span class="label">Repositories:</span>
            <span class="value">{installationToken.repositories}</span>
          </div>
          {#if installationToken.permissions}
            <div class="permissions">
              <span class="label">Permissions:</span>
              <div class="permission-list">
                {#each Object.entries(installationToken.permissions) as [key, value]}
                  <span class="permission">{key}: {value}</span>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Test Results -->
    {#if testResults}
      <div class="result-section">
        <h4>API Test Results</h4>
        <div class="test-results">
          <div class="test-row">
            <span class="label">API Call:</span>
            <span class="value">{testResults.apiCall}</span>
          </div>
          <div class="test-row">
            <span class="label">Status:</span>
            <span class="value status-{testResults.status}">{testResults.status}</span>
          </div>
          {#if testResults.rateLimit}
            <div class="test-row">
              <span class="label">Rate Limit:</span>
              <span class="value"
                >{testResults.rateLimit.remaining}/{testResults.rateLimit.limit}</span
              >
            </div>
            <div class="test-row">
              <span class="label">Reset:</span>
              <span class="value"
                >{new Date(testResults.rateLimit.reset * 1000).toLocaleTimeString()}</span
              >
            </div>
          {/if}
          {#if testResults.repositoriesData}
            <div class="test-row">
              <span class="label">Repositories:</span>
              <span class="value"
                >{testResults.repositoriesData.repositories.length} loaded out of {testResults
                  .repositoriesData.total_count} repositories</span
              >
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .github-settings-app {
    padding: 16px;
    background: #f8fafc;
    border-radius: 8px;
    margin: 16px 0;
    border: 1px solid #e2e8f0;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #1e293b;
      border-color: #334155;
    }
  }

  .section-header h3 {
    margin: 0 0 4px 0;
    color: #1e293b;
    font-size: 16px;
    font-weight: 600;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .auth-status {
    padding: 8px 12px;
    background: white;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #334155;
      border-color: #475569;
    }
  }

  .status-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  .status-indicator.authenticated {
    background: #10b981;
  }

  .status-indicator.unauthenticated {
    background: #ef4444;
  }

  .error-message {
    padding: 8px 12px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    color: #dc2626;
    font-size: 14px;
    margin: 8px 0;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #7f1d1d;
      border-color: #b91c1c;
      color: #fecaca;
    }
  }

  .success-message {
    padding: 8px 12px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 6px;
    color: #16a34a;
    font-size: 14px;
    margin: 8px 0;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #064e3b;
      border-color: #059669;
      color: #bbf7d0;
    }
  }

  .controls {
    margin: 16px 0;
  }

  .button-group {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    border: none;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #2563eb;
  }

  .btn-secondary {
    background: #6b7280;
    color: white;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #4b5563;
  }

  .btn-accent {
    background: #10b981;
    color: white;
  }

  .btn-accent:hover:not(:disabled) {
    background: #059669;
  }

  .btn-outline {
    background: white;
    color: #374151;
    border: 1px solid #d1d5db;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #334155;
      color: #e2e8f0;
      border-color: #475569;
    }
  }

  .btn-outline:hover:not(:disabled) {
    background: #f9fafb;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #475569;
    }
  }

  .results {
    margin-top: 16px;
  }

  .result-section {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 12px;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #334155;
      border-color: #475569;
    }
  }

  .result-section h4 {
    margin: 0 0 12px 0;
    color: #1e293b;
    font-size: 14px;
    font-weight: 600;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .integration-item {
    padding: 8px;
    background: #f8fafc;
    border-radius: 4px;
    margin-bottom: 8px;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #1e293b;
    }
  }

  .integration-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .username {
    font-weight: 600;
    color: #1e293b;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .installation-id {
    font-size: 12px;
    color: #6b7280;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #94a3b8;
    }
  }

  .integration-details {
    font-size: 12px;
    color: #6b7280;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #94a3b8;
    }
  }

  .token-info,
  .test-results {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .token-row,
  .test-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
    border-bottom: 1px solid #f1f5f9;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      border-bottom-color: #475569;
    }
  }

  .token-row:last-child,
  .test-row:last-child {
    border-bottom: none;
  }

  .label {
    font-weight: 500;
    color: #374151;
    font-size: 13px;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .value {
    font-family: monospace;
    font-size: 12px;
    color: #6b7280;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #94a3b8;
    }
  }

  .status-200 {
    color: #10b981;
  }

  .status-404,
  .status-401,
  .status-403 {
    color: #dc2626;
  }

  .permissions {
    flex-direction: column;
    align-items: flex-start;
  }

  .permission-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
  }

  .permission {
    font-size: 11px;
    padding: 2px 6px;
    background: #e2e8f0;
    border-radius: 3px;
    color: #475569;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #475569;
      color: #e2e8f0;
    }
  }

  .text-sm {
    font-size: 14px;
  }

  .text-xs {
    font-size: 12px;
  }

  .text-gray-600 {
    color: #4b5563;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #94a3b8;
    }
  }

  .text-green-600 {
    color: #16a34a;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #bbf7d0;
    }
  }
</style>
