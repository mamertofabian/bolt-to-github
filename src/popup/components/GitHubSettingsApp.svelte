<script lang="ts">
  import { onMount } from 'svelte';
  import { GitHubApiClientFactory } from '../../services/GitHubApiClientFactory';
  import type { IGitHubApiClient } from '../../services/interfaces/IGitHubApiClient';
  import { SupabaseAuthService } from '../../content/services/SupabaseAuthService';
  import { SUPABASE_CONFIG } from '../../lib/constants/supabase';
  import premiumStatusStore, { isAuthenticated } from '../../lib/stores/premiumStore';

  let githubApiClient: IGitHubApiClient | null = null;
  let supabaseAuthService: SupabaseAuthService;
  let authState: any = null;
  let githubIntegrations: any[] = [];
  let authStatus: any = null;
  let availableRepos: any[] = [];
  let loading = false;
  let error = '';
  let successMessage = '';
  let testResults: any = null;
  let selectedRepo = '';
  let repoOwner = '';

  // Use premiumStore for authentication status
  $: isUserAuthenticated = $isAuthenticated;
  $: premiumStatus = $premiumStatusStore;

  onMount(() => {
    supabaseAuthService = SupabaseAuthService.getInstance();
    authState = supabaseAuthService.getAuthState();

    // Auto-load if authenticated
    if (isUserAuthenticated) {
      initializeGitHubClient();
    }
  });

  async function initializeGitHubClient() {
    if (!isUserAuthenticated) {
      error = 'User not authenticated';
      return;
    }

    loading = true;
    error = '';
    successMessage = '';

    try {
      // Create GitHub App API client (no PAT fallback for this component)
      githubApiClient = await GitHubApiClientFactory.createApiClientForNewUser();

      // Load GitHub integrations and authentication status
      await Promise.all([
        loadGitHubIntegrations(),
        loadAuthenticationStatus(),
        loadAvailableRepositories(),
      ]);

      successMessage = 'GitHub API client initialized successfully';
    } catch (err: any) {
      error = err.message;
      console.error('Error initializing GitHub client:', err);
    } finally {
      loading = false;
    }
  }

  async function loadAvailableRepositories() {
    if (!githubApiClient) {
      return;
    }

    try {
      // Get repositories the installation has access to
      const reposResponse = await githubApiClient.request('GET', '/installation/repositories');
      availableRepos = reposResponse.repositories || [];

      // Auto-populate repo owner from the first repo or integration data
      if (availableRepos.length > 0) {
        repoOwner = availableRepos[0].owner.login;
      } else if (githubIntegrations.length > 0) {
        repoOwner = githubIntegrations[0].github_username;
      }

      console.log(`Found ${availableRepos.length} accessible repositories`);
    } catch (err: any) {
      console.error('Error loading repositories:', err);
      // Don't set error here as this is secondary functionality
    }
  }

  async function loadGitHubIntegrations() {
    if (!isUserAuthenticated) {
      error = 'User not authenticated';
      return;
    }

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
        console.log(`Found ${githubIntegrations.length} GitHub App integration(s)`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Failed to fetch integrations: ${response.status} - ${errorData.message || 'Unknown error'}`
        );
      }
    } catch (err: any) {
      error = err.message;
      console.error('Error loading GitHub integrations:', err);
    }
  }

  async function loadAuthenticationStatus() {
    try {
      // Get authentication status from factory
      authStatus = await GitHubApiClientFactory.getAuthenticationStatus();
      console.log('Authentication status:', authStatus);
    } catch (err: any) {
      console.error('Error loading authentication status:', err);
    }
  }

  async function testGitHubAPI() {
    if (!githubApiClient) {
      error = 'GitHub API client not initialized. Initialize client first.';
      return;
    }

    loading = true;
    error = '';
    successMessage = '';
    testResults = null;

    try {
      // Test rate limit check
      const rateLimitResponse = await githubApiClient.getRateLimit();

      // Test installation repositories (GitHub App compatible endpoint)
      const reposResponse = await githubApiClient.request('GET', '/installation/repositories');

      testResults = {
        rateLimit: rateLimitResponse?.rate || null,
        repositoriesData: reposResponse,
        apiCall: 'GET /installation/repositories',
        status: 200, // Success if we got here
        clientType: 'github_app',
      };
      successMessage = 'GitHub API test successful';
    } catch (err: any) {
      error = err.message;
      console.error('Error testing GitHub API:', err);
    } finally {
      loading = false;
    }
  }

  async function testRepoAccess() {
    if (!githubApiClient) {
      error = 'GitHub API client not initialized. Initialize client first.';
      return;
    }

    if (!selectedRepo) {
      error = 'Please select a repository to test';
      return;
    }

    const [owner, name] = selectedRepo.split('/');

    loading = true;
    error = '';
    successMessage = '';

    try {
      // Test repository access and get repo info
      const repoResponse = await githubApiClient.request('GET', `/repos/${owner}/${name}`);

      testResults = {
        ...testResults,
        repoInfo: repoResponse,
        apiCall: `GET /repos/${owner}/${name}`,
        status: 200,
      };

      console.log('Repository access test:', repoResponse);
      successMessage = `Repository access successful: ${repoResponse.full_name}`;
    } catch (err: any) {
      // Provide helpful error message for 404
      if (err.message.includes('404') || err.message.includes('Not Found')) {
        error = `Repository not found. This usually means:\n• The GitHub App is not installed on this repository\n• The repository doesn't exist or is private\n• You don't have the required permissions`;
      } else {
        error = err.message;
      }
      console.error('Error testing repository access:', err);
    } finally {
      loading = false;
    }
  }

  async function testRepoContents() {
    if (!githubApiClient) {
      error = 'GitHub API client not initialized. Initialize client first.';
      return;
    }

    if (!selectedRepo) {
      error = 'Please select a repository to test';
      return;
    }

    const [owner, name] = selectedRepo.split('/');

    loading = true;
    error = '';
    successMessage = '';

    try {
      // Test getting repository contents (root directory)
      const contentsResponse = await githubApiClient.request(
        'GET',
        `/repos/${owner}/${name}/contents`
      );

      testResults = {
        ...testResults,
        contents: contentsResponse,
        apiCall: `GET /repos/${owner}/${name}/contents`,
        status: 200,
      };

      console.log('Repository contents:', contentsResponse);
      successMessage = `Repository contents retrieved: ${contentsResponse.length} items found`;
    } catch (err: any) {
      if (err.message.includes('404') || err.message.includes('Not Found')) {
        error = `Repository not accessible. Make sure the GitHub App is installed on this repository.`;
      } else {
        error = err.message;
      }
      console.error('Error testing repository contents:', err);
    } finally {
      loading = false;
    }
  }

  async function testIssues() {
    if (!githubApiClient) {
      error = 'GitHub API client not initialized. Initialize client first.';
      return;
    }

    if (!selectedRepo) {
      error = 'Please select a repository to test';
      return;
    }

    const [owner, name] = selectedRepo.split('/');

    loading = true;
    error = '';
    successMessage = '';

    try {
      // Test listing issues
      const issuesResponse = await githubApiClient.request(
        'GET',
        `/repos/${owner}/${name}/issues?state=all&per_page=5`
      );

      testResults = {
        ...testResults,
        issues: issuesResponse,
        apiCall: `GET /repos/${owner}/${name}/issues`,
        status: 200,
      };

      console.log('Issues:', issuesResponse);
      successMessage = `Issues retrieved: ${issuesResponse.length} issues found`;
    } catch (err: any) {
      if (err.message.includes('404') || err.message.includes('Not Found')) {
        error = `Repository not accessible. Make sure the GitHub App is installed on this repository.`;
      } else {
        error = err.message;
      }
      console.error('Error testing issues:', err);
    } finally {
      loading = false;
    }
  }

  async function testCommits() {
    if (!githubApiClient) {
      error = 'GitHub API client not initialized. Initialize client first.';
      return;
    }

    if (!selectedRepo) {
      error = 'Please select a repository to test';
      return;
    }

    const [owner, name] = selectedRepo.split('/');

    loading = true;
    error = '';
    successMessage = '';

    try {
      // Test getting commits
      const commitsResponse = await githubApiClient.request(
        'GET',
        `/repos/${owner}/${name}/commits?per_page=5`
      );

      testResults = {
        ...testResults,
        commits: commitsResponse,
        apiCall: `GET /repos/${owner}/${name}/commits`,
        status: 200,
      };

      console.log('Commits:', commitsResponse);
      successMessage = `Commits retrieved: ${commitsResponse.length} commits found`;
    } catch (err: any) {
      if (err.message.includes('404') || err.message.includes('Not Found')) {
        error = `Repository not accessible. Make sure the GitHub App is installed on this repository.`;
      } else {
        error = err.message;
      }
      console.error('Error testing commits:', err);
    } finally {
      loading = false;
    }
  }

  async function refreshAuthStatus() {
    loading = true;
    error = '';
    successMessage = '';

    try {
      await loadAuthenticationStatus();
      successMessage = 'Authentication status refreshed';
    } catch (err: any) {
      error = err.message;
      console.error('Error refreshing auth status:', err);
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
    authStatus = null;
    testResults = null;
    availableRepos = [];
    error = '';
    successMessage = '';
    githubApiClient = null;
    selectedRepo = '';
    repoOwner = '';
  }
</script>

<div class="github-settings-app">
  <div class="section-header">
    <h3>🔧 GitHub App Repository Testing</h3>
    <p class="text-sm text-gray-600">
      Test GitHub App functionality for repository operations (contents, commits, issues, PRs)
    </p>
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
    {#if githubApiClient}
      <div class="text-xs text-blue-600 dark:text-blue-400 mt-1">
        GitHub API Client: Initialized
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
    <!-- Repository Test Configuration -->
    <div class="repo-config">
      <h4>Repository Test Configuration</h4>
      <div class="repo-info">
        {#if repoOwner}
          <div class="repo-owner-display">
            <span class="label">Repository Owner:</span>
            <span class="value">@{repoOwner}</span>
          </div>
        {/if}

        {#if availableRepos.length > 0}
          <div class="repo-selector">
            <label for="repo-select">Select Repository:</label>
            <select id="repo-select" bind:value={selectedRepo} disabled={loading}>
              <option value="">-- Select a repository --</option>
              {#each availableRepos as repo}
                <option value="{repo.owner.login}/{repo.name}">
                  {repo.name}
                  {repo.private ? '🔒' : '🌐'}
                </option>
              {/each}
            </select>
            <div class="repo-count">
              {availableRepos.length} repositories available
            </div>
          </div>
        {:else if githubApiClient}
          <div class="no-repos-message">
            <span class="warning-icon">⚠️</span>
            <span
              >No repositories found. Make sure your GitHub App is installed on at least one
              repository.</span
            >
          </div>
        {/if}

        {#if availableRepos.length > 0}
          <div class="help-text">
            <strong>💡 Note:</strong> You can only test repositories where your GitHub App is installed.
            If you get a "404 Not Found" error, it means the app isn't installed on that repository.
          </div>
        {/if}
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="button-group">
      <button
        class="btn btn-primary"
        on:click={initializeGitHubClient}
        disabled={loading || !isUserAuthenticated}
      >
        {loading ? 'Initializing...' : 'Initialize GitHub Client'}
      </button>

      <button class="btn btn-secondary" on:click={refreshAuthStatus} disabled={loading}>
        {loading ? 'Loading...' : 'Refresh Auth Status'}
      </button>

      <button
        class="btn btn-accent"
        on:click={testGitHubAPI}
        disabled={loading || !githubApiClient}
      >
        {loading ? 'Testing...' : 'Test Installation Repos'}
      </button>

      <button class="btn btn-outline" on:click={clearResults} disabled={loading}>
        Clear Results
      </button>
    </div>

    <!-- Repository Test Buttons -->
    <div class="repo-test-group">
      <h4>Repository-Specific Tests</h4>
      <div class="button-group">
        <button
          class="btn btn-info"
          on:click={testRepoAccess}
          disabled={loading || !githubApiClient || !selectedRepo}
        >
          {loading ? 'Testing...' : 'Test Repo Access'}
        </button>

        <button
          class="btn btn-info"
          on:click={testRepoContents}
          disabled={loading || !githubApiClient || !selectedRepo}
        >
          {loading ? 'Testing...' : 'Test Repo Contents'}
        </button>

        <button
          class="btn btn-info"
          on:click={testIssues}
          disabled={loading || !githubApiClient || !selectedRepo}
        >
          {loading ? 'Testing...' : 'Test Issues'}
        </button>

        <button
          class="btn btn-info"
          on:click={testCommits}
          disabled={loading || !githubApiClient || !selectedRepo}
        >
          {loading ? 'Testing...' : 'Test Commits'}
        </button>
      </div>
    </div>
  </div>

  <!-- Results -->
  <div class="results">
    <!-- Authentication Status -->
    {#if authStatus}
      <div class="result-section">
        <h4>Authentication Status</h4>
        <div class="auth-status-info">
          <div class="status-row">
            <span class="label">GitHub App Available:</span>
            <span class="value status-{authStatus.hasGitHubApp ? 'success' : 'error'}">
              {authStatus.hasGitHubApp ? 'Yes' : 'No'}
            </span>
          </div>
          <div class="status-row">
            <span class="label">Can Use GitHub App:</span>
            <span class="value status-{authStatus.canUseGitHubApp ? 'success' : 'error'}">
              {authStatus.canUseGitHubApp ? 'Yes' : 'No'}
            </span>
          </div>
          <div class="status-row">
            <span class="label">Recommended Auth:</span>
            <span class="value">{authStatus.recommended}</span>
          </div>
          {#if authStatus.currentRateLimit}
            <div class="status-row">
              <span class="label">Current Rate Limit:</span>
              <span class="value">
                {authStatus.currentRateLimit.remaining}/{authStatus.currentRateLimit.limit}
              </span>
            </div>
            <div class="status-row">
              <span class="label">Reset Time:</span>
              <span class="value">
                {new Date(authStatus.currentRateLimit.reset * 1000).toLocaleTimeString()}
              </span>
            </div>
          {/if}
        </div>
      </div>
    {/if}

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
          <div class="test-row">
            <span class="label">Client Type:</span>
            <span class="value">{testResults.clientType || 'github_app'}</span>
          </div>
          {#if testResults.rateLimit}
            <div class="test-row">
              <span class="label">Rate Limit:</span>
              <span class="value">
                {testResults.rateLimit.remaining}/{testResults.rateLimit.limit}
              </span>
            </div>
            <div class="test-row">
              <span class="label">Reset:</span>
              <span class="value">
                {new Date(testResults.rateLimit.reset * 1000).toLocaleTimeString()}
              </span>
            </div>
          {/if}

          <!-- Installation Repositories Data -->
          {#if testResults.repositoriesData?.repositories}
            <div class="test-row">
              <span class="label">Installation Repositories:</span>
              <span class="value">
                {testResults.repositoriesData.repositories.length} out of {testResults
                  .repositoriesData.total_count}
              </span>
            </div>
          {/if}

          <!-- Repository Info -->
          {#if testResults.repoInfo}
            <div class="test-row">
              <span class="label">Repository:</span>
              <span class="value">{testResults.repoInfo.full_name}</span>
            </div>
            <div class="test-row">
              <span class="label">Description:</span>
              <span class="value">{testResults.repoInfo.description || 'No description'}</span>
            </div>
            <div class="test-row">
              <span class="label">Default Branch:</span>
              <span class="value">{testResults.repoInfo.default_branch}</span>
            </div>
            <div class="test-row">
              <span class="label">Permissions:</span>
              <span class="value">
                Push: {testResults.repoInfo.permissions?.push ? 'Yes' : 'No'}, Pull: {testResults
                  .repoInfo.permissions?.pull
                  ? 'Yes'
                  : 'No'}, Admin: {testResults.repoInfo.permissions?.admin ? 'Yes' : 'No'}
              </span>
            </div>
          {/if}

          <!-- Repository Contents -->
          {#if testResults.contents}
            <div class="test-row">
              <span class="label">Contents:</span>
              <span class="value">{testResults.contents.length} items in root directory</span>
            </div>
            <div class="content-preview">
              <span class="label">Files/Folders:</span>
              <div class="content-list">
                {#each testResults.contents.slice(0, 5) as item}
                  <span class="content-item">
                    {item.type === 'file' ? '📄' : '📁'}
                    {item.name}
                  </span>
                {/each}
                {#if testResults.contents.length > 5}
                  <span class="content-item">... and {testResults.contents.length - 5} more</span>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Issues -->
          {#if testResults.issues}
            <div class="test-row">
              <span class="label">Issues:</span>
              <span class="value">{testResults.issues.length} issues retrieved</span>
            </div>
            {#if testResults.issues.length > 0}
              <div class="issues-preview">
                <span class="label">Recent Issues:</span>
                <div class="issues-list">
                  {#each testResults.issues.slice(0, 3) as issue}
                    <div class="issue-item">
                      <span class="issue-number">#{issue.number}</span>
                      <span class="issue-title">{issue.title}</span>
                      <span
                        class="issue-state status-{issue.state === 'open' ? 'success' : 'closed'}"
                        >{issue.state}</span
                      >
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          {/if}

          <!-- Commits -->
          {#if testResults.commits}
            <div class="test-row">
              <span class="label">Commits:</span>
              <span class="value">{testResults.commits.length} commits retrieved</span>
            </div>
            {#if testResults.commits.length > 0}
              <div class="commits-preview">
                <span class="label">Recent Commits:</span>
                <div class="commits-list">
                  {#each testResults.commits.slice(0, 3) as commit}
                    <div class="commit-item">
                      <span class="commit-sha">{commit.sha.substring(0, 7)}</span>
                      <span class="commit-message">{commit.commit.message.split('\n')[0]}</span>
                      <span class="commit-author">{commit.commit.author.name}</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
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

  .repo-config {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 16px;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #334155;
      border-color: #475569;
    }
  }

  .repo-config h4 {
    margin: 0 0 12px 0;
    color: #1e293b;
    font-size: 14px;
    font-weight: 600;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .input-group {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .repo-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .repo-owner-display {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 4px;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #064e3b;
      border-color: #059669;
    }
  }

  .repo-owner-display .label {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .repo-owner-display .value {
    font-family: monospace;
    font-size: 13px;
    font-weight: 600;
    color: #16a34a;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #bbf7d0;
    }
  }

  .repo-selector {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .repo-selector label {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .repo-selector select {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 14px;
    background: white;
    color: #374151;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #1e293b;
      border-color: #475569;
      color: #e2e8f0;
    }
  }

  .repo-selector select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .repo-selector select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .repo-count {
    font-size: 12px;
    color: #6b7280;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #94a3b8;
    }
  }

  .no-repos-message {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px;
    background: #fef3cd;
    border: 1px solid #fbbf24;
    border-radius: 4px;
    color: #92400e;
    font-size: 14px;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #451a03;
      border-color: #d97706;
      color: #fed7aa;
    }
  }

  .warning-icon {
    font-size: 16px;
  }

  .help-text {
    padding: 8px 12px;
    background: #eff6ff;
    border: 1px solid #93c5fd;
    border-radius: 4px;
    color: #1e40af;
    font-size: 13px;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #1e3a8a;
      border-color: #3b82f6;
      color: #93c5fd;
    }
  }

  .input-field {
    flex: 1;
    min-width: 200px;
  }

  .input-field label {
    display: block;
    margin-bottom: 4px;
    font-size: 13px;
    font-weight: 500;
    color: #374151;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .input-field input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 14px;
    background: white;
    color: #374151;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #1e293b;
      border-color: #475569;
      color: #e2e8f0;
    }
  }

  .input-field input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .input-field input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .repo-test-group {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px;
    margin-top: 16px;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #334155;
      border-color: #475569;
    }
  }

  .repo-test-group h4 {
    margin: 0 0 12px 0;
    color: #1e293b;
    font-size: 14px;
    font-weight: 600;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
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

  .btn-info {
    background: #0ea5e9;
    color: white;
  }

  .btn-info:hover:not(:disabled) {
    background: #0284c7;
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

  .auth-status-info,
  .test-results {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .status-row,
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

  .status-row:last-child,
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

  .status-success {
    color: #10b981;
  }

  .status-error {
    color: #dc2626;
  }

  .status-404,
  .status-401,
  .status-403 {
    color: #dc2626;
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

  .text-blue-600 {
    color: #2563eb;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #93c5fd;
    }
  }
</style>
