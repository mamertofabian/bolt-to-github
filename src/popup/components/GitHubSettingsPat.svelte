<script lang="ts">
  import { onMount } from 'svelte';
  import { GitHubApiClientFactory } from '../../services/GitHubApiClientFactory';
  import type { IGitHubApiClient } from '../../services/interfaces/IGitHubApiClient';
  import { githubSettingsStore, githubSettingsActions } from '../../lib/stores/githubSettings';
  import premiumStatusStore, { isAuthenticated } from '../../lib/stores/premiumStore';

  let githubApiClient: IGitHubApiClient | null = null;
  let authStatus: any = null;
  let availableRepos: any[] = [];
  let userInfo: any = null;
  let loading = false;
  let error = '';
  let successMessage = '';
  let testResults: any = null;
  let selectedRepo = '';
  let repoOwner = '';

  // Use premiumStore for authentication status
  $: isUserAuthenticated = $isAuthenticated;
  $: premiumStatus = $premiumStatusStore;
  $: githubSettings = $githubSettingsStore;
  $: hasPATToken = Boolean(githubSettings.githubToken);
  $: canInitialize = isUserAuthenticated && hasPATToken;

  onMount(async () => {
    // Initialize GitHub settings store to load stored tokens
    await githubSettingsActions.initialize();
  });

  async function initializeGitHubClient() {
    if (!hasPATToken) {
      error = 'No Personal Access Token found in storage';
      return;
    }

    loading = true;
    error = '';
    successMessage = '';

    try {
      // Create PAT-based API client for existing users
      githubApiClient = await GitHubApiClientFactory.createApiClientForExistingUser(
        githubSettings.githubToken,
        false // Don't allow upgrade to maintain PAT testing
      );

      // Load authentication status and user data
      await Promise.all([loadAuthenticationStatus(), loadUserInfo(), loadUserRepositories()]);

      successMessage = 'GitHub PAT client initialized successfully';
    } catch (err: any) {
      error = err.message;
      console.error('Error initializing GitHub PAT client:', err);
    } finally {
      loading = false;
    }
  }

  async function loadAuthenticationStatus() {
    try {
      // Get authentication status from factory (with PAT)
      authStatus = await GitHubApiClientFactory.getAuthenticationStatus(
        githubSettings.githubToken,
        true // Check both methods for comparison
      );
      console.log('Authentication status:', authStatus);
    } catch (err: any) {
      console.error('Error loading authentication status:', err);
    }
  }

  async function loadUserInfo() {
    if (!githubApiClient) {
      return;
    }

    try {
      // Get user information (works with PAT)
      userInfo = await githubApiClient.getUser();
      repoOwner = userInfo.login;
      console.log('User info loaded:', userInfo.login);
    } catch (err: any) {
      console.error('Error loading user info:', err);
    }
  }

  async function loadUserRepositories() {
    if (!githubApiClient) {
      return;
    }

    try {
      // Get user's repositories (PAT can access all user repos)
      const reposResponse = await githubApiClient.getUserRepositories({
        sort: 'updated',
        per_page: 50,
      });
      availableRepos = reposResponse || [];

      console.log(`Found ${availableRepos.length} accessible repositories`);
    } catch (err: any) {
      console.error('Error loading repositories:', err);
    }
  }

  async function testUserProfile() {
    if (!githubApiClient) {
      error = 'GitHub API client not initialized. Initialize client first.';
      return;
    }

    loading = true;
    error = '';
    successMessage = '';

    try {
      // Test user profile endpoint (PAT advantage)
      const userResponse = await githubApiClient.getUser();

      testResults = {
        ...testResults,
        userProfile: userResponse,
        apiCall: 'GET /user',
        status: 200,
      };

      console.log('User profile test:', userResponse);
      successMessage = `User profile retrieved: ${userResponse.login}`;
    } catch (err: any) {
      error = err.message;
      console.error('Error testing user profile:', err);
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
      const repoResponse = await githubApiClient.getRepository(owner, name);

      testResults = {
        ...testResults,
        repoInfo: repoResponse,
        apiCall: `GET /repos/${owner}/${name}`,
        status: 200,
      };

      console.log('Repository access test:', repoResponse);
      successMessage = `Repository access successful: ${repoResponse.full_name}`;
    } catch (err: any) {
      if (err.message.includes('404') || err.message.includes('Not Found')) {
        error = `Repository not found or you don't have access to it.`;
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
      const contentsResponse = await githubApiClient.getRepositoryContents(owner, name);

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
        error = `Repository not accessible or empty.`;
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
      const issuesResponse = await githubApiClient.getRepositoryIssues(owner, name, {
        state: 'all',
        per_page: 5,
      });

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
        error = `Repository not accessible or issues are disabled.`;
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
      const commitsResponse = await githubApiClient.getRepositoryCommits(owner, name, {
        per_page: 5,
      });

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
        error = `Repository not accessible or has no commits.`;
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

  function clearResults() {
    authStatus = null;
    testResults = null;
    availableRepos = [];
    userInfo = null;
    error = '';
    successMessage = '';
    githubApiClient = null;
    selectedRepo = '';
    repoOwner = '';
  }
</script>

<div class="github-pat-settings-app">
  <div class="section-header">
    <h3>🔑 GitHub PAT (Personal Access Token) Testing</h3>
    <p class="text-sm text-gray-600">
      Test GitHub operations using Personal Access Token for backward compatibility
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
      <div class="text-xs text-orange-600 dark:text-orange-400 mt-1">
        GitHub API Client: PAT-based
      </div>
    {/if}
  </div>

  <!-- PAT Detection Status -->
  <div class="pat-status">
    <h4>Personal Access Token Status</h4>
    <div class="token-detection">
      {#if hasPATToken}
        <div class="token-found">
          <span class="status-icon">✅</span>
          <div class="status-details">
            <span class="status-title">PAT Token Detected</span>
            <span class="status-description"
              >Found stored Personal Access Token in browser storage</span
            >
            <div class="token-preview">
              Token: {githubSettings.githubToken.substring(0, 10)}...
            </div>
            {#if githubSettings.repoOwner}
              <div class="owner-info">
                Owner: @{githubSettings.repoOwner}
              </div>
            {/if}
          </div>
        </div>
      {:else}
        <div class="token-not-found">
          <span class="status-icon">❌</span>
          <div class="status-details">
            <span class="status-title">No PAT Token Found</span>
            <span class="status-description"
              >No Personal Access Token detected in browser storage</span
            >
            <div class="setup-help">
              <span class="help-icon">💡</span>
              <span>Configure a PAT in your extension settings or GitHub App settings</span>
            </div>
          </div>
        </div>
      {/if}

      {#if githubSettings.authMethod && githubSettings.authMethod !== 'unknown'}
        <div class="auth-method-display">
          <span class="label">Detected Auth Method:</span>
          <span class="value auth-method-{githubSettings.authMethod}">
            {githubSettings.authMethod.toUpperCase()}
          </span>
          {#if githubSettings.authMethod === 'pat'}
            <span class="method-note">(Personal Access Token)</span>
          {:else if githubSettings.authMethod === 'github_app'}
            <span class="method-note">(GitHub App)</span>
          {/if}
        </div>
      {/if}
    </div>
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
    <!-- Action Buttons -->
    <div class="button-group">
      <button
        class="btn btn-primary"
        on:click={initializeGitHubClient}
        disabled={loading || !canInitialize}
      >
        {loading ? 'Initializing...' : 'Initialize PAT Client'}
      </button>

      <button
        class="btn btn-secondary"
        on:click={refreshAuthStatus}
        disabled={loading || !hasPATToken}
      >
        {loading ? 'Loading...' : 'Refresh Auth Status'}
      </button>

      <button
        class="btn btn-accent"
        on:click={testUserProfile}
        disabled={loading || !githubApiClient}
      >
        {loading ? 'Testing...' : 'Test User Profile'}
      </button>

      <button class="btn btn-outline" on:click={clearResults} disabled={loading}>
        Clear Results
      </button>
    </div>

    <!-- Repository Selection -->
    {#if availableRepos.length > 0}
      <div class="repo-config">
        <h4>Repository Test Configuration</h4>
        <div class="repo-info">
          {#if repoOwner}
            <div class="repo-owner-display">
              <span class="label">Repository Owner:</span>
              <span class="value">@{repoOwner}</span>
            </div>
          {/if}

          <div class="repo-selector">
            <label for="repo-select">Select Repository:</label>
            <select id="repo-select" bind:value={selectedRepo} disabled={loading}>
              <option value="">-- Select a repository --</option>
              {#each availableRepos as repo}
                <option value="{repo.owner.login}/{repo.name}">
                  {repo.name}
                  {repo.private ? '🔒' : '🌐'} ({repo.owner.login})
                </option>
              {/each}
            </select>
            <div class="repo-count">
              {availableRepos.length} repositories available
            </div>
          </div>

          <div class="help-text">
            <strong>✅ PAT Advantage:</strong> You can access any repository you have permissions to,
            not just installed apps.
          </div>
        </div>
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
    {/if}
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
            <span class="label">PAT Available:</span>
            <span class="value status-{authStatus.hasPAT ? 'success' : 'error'}">
              {authStatus.hasPAT ? 'Yes' : 'No'}
            </span>
          </div>
          <div class="status-row">
            <span class="label">Can Use PAT:</span>
            <span class="value status-{authStatus.canUsePAT ? 'success' : 'error'}">
              {authStatus.canUsePAT ? 'Yes' : 'No'}
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
          {#if authStatus.rateLimits.githubApp && authStatus.rateLimits.pat}
            <div class="upgrade-notice">
              <span class="upgrade-icon">🚀</span>
              <span>
                Consider upgrading to GitHub App for higher rate limits:
                {authStatus.rateLimits.githubApp.limit}/hour vs {authStatus.rateLimits.pat
                  .limit}/hour
              </span>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- User Profile -->
    {#if userInfo}
      <div class="result-section">
        <h4>User Profile</h4>
        <div class="user-info">
          <div class="user-row">
            <span class="label">Username:</span>
            <span class="value">@{userInfo.login}</span>
          </div>
          <div class="user-row">
            <span class="label">Name:</span>
            <span class="value">{userInfo.name || 'Not set'}</span>
          </div>
          <div class="user-row">
            <span class="label">Public Repos:</span>
            <span class="value">{userInfo.public_repos}</span>
          </div>
          <div class="user-row">
            <span class="label">Account Type:</span>
            <span class="value">{userInfo.type}</span>
          </div>
          {#if userInfo.plan}
            <div class="user-row">
              <span class="label">GitHub Plan:</span>
              <span class="value">{userInfo.plan.name}</span>
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
          <div class="test-row">
            <span class="label">Client Type:</span>
            <span class="value">PAT-based</span>
          </div>

          <!-- User Profile Results -->
          {#if testResults.userProfile}
            <div class="test-row">
              <span class="label">Profile Retrieved:</span>
              <span class="value"
                >{testResults.userProfile.login} ({testResults.userProfile.type})</span
              >
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
  .github-pat-settings-app {
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

  .pat-config {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px;
    margin: 16px 0;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #334155;
      border-color: #475569;
    }
  }

  .pat-config h4,
  .pat-status h4 {
    margin: 0 0 12px 0;
    color: #1e293b;
    font-size: 14px;
    font-weight: 600;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .pat-status {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px;
    margin: 16px 0;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #334155;
      border-color: #475569;
    }
  }

  .token-detection {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .token-found,
  .token-not-found {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    border-radius: 6px;
  }

  .token-found {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #064e3b;
      border-color: #059669;
    }
  }

  .token-not-found {
    background: #fef2f2;
    border: 1px solid #fecaca;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #7f1d1d;
      border-color: #b91c1c;
    }
  }

  .status-icon {
    font-size: 18px;
    margin-top: 2px;
  }

  .status-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .status-title {
    font-weight: 600;
    font-size: 14px;
    color: #374151;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .status-description {
    font-size: 13px;
    color: #6b7280;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #94a3b8;
    }
  }

  .token-preview,
  .owner-info {
    font-family: monospace;
    font-size: 12px;
    color: #16a34a;
    background: rgba(34, 197, 94, 0.1);
    padding: 4px 8px;
    border-radius: 3px;
    margin-top: 4px;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #bbf7d0;
      background: rgba(34, 197, 94, 0.2);
    }
  }

  .setup-help {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    font-size: 12px;
    color: #dc2626;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #fecaca;
    }
  }

  .auth-method-display {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #eff6ff;
    border: 1px solid #93c5fd;
    border-radius: 4px;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #1e3a8a;
      border-color: #3b82f6;
    }
  }

  .auth-method-display .label {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .auth-method-display .value {
    font-family: monospace;
    font-size: 12px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .auth-method-pat {
    background: #fbbf24;
    color: #92400e;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #d97706;
      color: #fed7aa;
    }
  }

  .auth-method-github_app {
    background: #10b981;
    color: white;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #059669;
      color: #bbf7d0;
    }
  }

  .method-note {
    font-size: 11px;
    color: #6b7280;
    font-style: italic;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #94a3b8;
    }
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
    margin: 16px 0;
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

  .auth-status-info,
  .user-info,
  .test-results {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .status-row,
  .user-row,
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
  .user-row:last-child,
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

  .status-closed {
    color: #7c3aed;
  }

  .upgrade-notice {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #fef3cd;
    border: 1px solid #fbbf24;
    border-radius: 4px;
    color: #92400e;
    font-size: 12px;
    margin-top: 8px;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #451a03;
      border-color: #d97706;
      color: #fed7aa;
    }
  }

  .upgrade-icon {
    font-size: 14px;
  }

  .content-preview,
  .issues-preview,
  .commits-preview {
    flex-direction: column;
    align-items: flex-start;
  }

  .content-list,
  .issues-list,
  .commits-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
    width: 100%;
  }

  .content-item {
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

  .issue-item,
  .commit-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    background: #f8fafc;
    border-radius: 3px;
    font-size: 11px;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      background: #1e293b;
    }
  }

  .issue-number,
  .commit-sha {
    font-weight: 600;
    color: #3b82f6;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #93c5fd;
    }
  }

  .issue-title,
  .commit-message {
    flex: 1;
    color: #374151;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .issue-state {
    font-size: 10px;
    padding: 1px 4px;
    border-radius: 2px;
    font-weight: 500;
  }

  .commit-author {
    font-size: 10px;
    color: #6b7280;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #94a3b8;
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

  .text-orange-600 {
    color: #ea580c;
    /* Dark mode styles */
    @media (prefers-color-scheme: dark) {
      color: #fdba74;
    }
  }
</style>
