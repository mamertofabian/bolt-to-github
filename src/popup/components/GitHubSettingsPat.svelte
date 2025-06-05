<script lang="ts">
  import { onMount } from 'svelte';
  import { GitHubService } from '../../services/GitHubService';
  import { githubSettingsStore, githubSettingsActions } from '$lib/stores';
  import premiumStatusStore, { isAuthenticated } from '../../lib/stores/premiumStore';

  let githubService: GitHubService | null = null;
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

  async function initializeGitHubService() {
    if (!hasPATToken) {
      error = 'No Personal Access Token found in storage';
      return;
    }

    loading = true;
    error = '';
    successMessage = '';

    try {
      // Create GitHub Service for existing users with PAT (no upgrade to maintain PAT testing)
      githubService = await GitHubService.createForExistingUser(
        githubSettings.githubToken,
        false // Don't allow upgrade to maintain PAT testing
      );

      // Verify we're using PAT
      const clientType = githubService.getApiClientType();
      console.log(`GitHub Service initialized with: ${clientType}`);

      // Load authentication status and user data
      await Promise.all([loadAuthenticationStatus(), loadUserInfo(), loadUserRepositories()]);

      successMessage = `GitHub Service initialized successfully (${clientType})`;
    } catch (err: any) {
      error = err.message;
      console.error('Error initializing GitHub Service:', err);
    } finally {
      loading = false;
    }
  }

  async function loadAuthenticationStatus() {
    try {
      // Get authentication status from GitHubService (with PAT)
      if (githubService) {
        authStatus = await githubService.getAuthStatus();
      } else {
        // Fallback to static method with PAT token
        authStatus = await GitHubService.getAuthenticationStatus(
          githubSettings.githubToken,
          true // Check both methods for comparison
        );
      }
      console.log('Authentication status:', authStatus);
    } catch (err: any) {
      console.error('Error loading authentication status:', err);
    }
  }

  async function loadUserInfo() {
    if (!githubService) {
      return;
    }

    try {
      // Get user information using GitHubService (works with PAT)
      userInfo = await githubService.request('GET', '/user');
      repoOwner = userInfo.login;
      console.log('User info loaded:', userInfo.login);
    } catch (err: any) {
      console.error('Error loading user info:', err);
    }
  }

  async function loadUserRepositories() {
    if (!githubService) {
      return;
    }

    try {
      // Get user's repositories using GitHubService (PAT can access all user repos)
      availableRepos = await githubService.listRepos();

      console.log(`Found ${availableRepos.length} accessible repositories`);
    } catch (err: any) {
      console.error('Error loading repositories:', err);
    }
  }

  async function testUserProfile() {
    if (!githubService) {
      error = 'GitHub Service not initialized. Initialize service first.';
      return;
    }

    loading = true;
    error = '';
    successMessage = '';

    try {
      // Test user profile endpoint using GitHubService (PAT advantage)
      const userResponse = await githubService.request('GET', '/user');

      testResults = {
        ...testResults,
        userProfile: userResponse,
        apiCall: 'GitHubService.request("GET", "/user")',
        status: 200,
        clientType: githubService.getApiClientType(),
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
    if (!githubService) {
      error = 'GitHub Service not initialized. Initialize service first.';
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
      // Test repository access using GitHubService
      const repoResponse = await githubService.getRepoInfo(owner, name);

      testResults = {
        ...testResults,
        repoInfo: repoResponse,
        apiCall: `GitHubService.getRepoInfo('${owner}', '${name}')`,
        status: 200,
      };

      console.log('Repository access test:', repoResponse);
      successMessage = `Repository access successful: ${owner}/${name}`;
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
    if (!githubService) {
      error = 'GitHub Service not initialized. Initialize service first.';
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
      // Test getting repository contents using GitHubService
      const contentsResponse = await githubService.request(
        'GET',
        `/repos/${owner}/${name}/contents`
      );

      testResults = {
        ...testResults,
        contents: contentsResponse,
        apiCall: `GitHubService.request('GET', '/repos/${owner}/${name}/contents')`,
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
    if (!githubService) {
      error = 'GitHub Service not initialized. Initialize service first.';
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
      // Test listing issues using GitHubService
      const issuesResponse = await githubService.getIssues(owner, name, 'all');

      testResults = {
        ...testResults,
        issues: issuesResponse.slice(0, 5), // Limit to 5 for display
        apiCall: `GitHubService.getIssues('${owner}', '${name}', 'all')`,
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
    if (!githubService) {
      error = 'GitHub Service not initialized. Initialize service first.';
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
      // Test getting commits using GitHubService
      const commitsResponse = await githubService.request(
        'GET',
        `/repos/${owner}/${name}/commits?per_page=5`
      );

      testResults = {
        ...testResults,
        commits: commitsResponse,
        apiCall: `GitHubService.request('GET', '/repos/${owner}/${name}/commits?per_page=5')`,
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

  async function testTokenValidation() {
    if (!githubService) {
      error = 'GitHub Service not initialized. Initialize service first.';
      return;
    }

    loading = true;
    error = '';
    successMessage = '';

    try {
      // Test token validation using GitHubService
      const isValid = await githubService.validateToken();

      testResults = {
        ...testResults,
        tokenValidation: { isValid },
        apiCall: 'GitHubService.validateToken()',
        status: isValid ? 200 : 401,
      };

      console.log('Token validation test:', isValid);
      successMessage = `Token validation ${isValid ? 'successful' : 'failed'}`;
    } catch (err: any) {
      error = err.message;
      console.error('Error testing token validation:', err);
    } finally {
      loading = false;
    }
  }

  async function testUpgradeCheck() {
    if (!githubService) {
      error = 'GitHub Service not initialized. Initialize service first.';
      return;
    }

    loading = true;
    error = '';
    successMessage = '';

    try {
      // Test upgrade capabilities
      const authStatus = await githubService.getAuthStatus();

      testResults = {
        ...testResults,
        upgradeCheck: authStatus,
        apiCall: 'GitHubService.getAuthStatus()',
        status: 200,
      };

      console.log('Upgrade check:', authStatus);

      if (authStatus.canUpgradeToGitHubApp) {
        successMessage = 'Upgrade to GitHub App is available!';
      } else {
        successMessage = 'No upgrade available (or already using best method)';
      }
    } catch (err: any) {
      error = err.message;
      console.error('Error testing upgrade check:', err);
    } finally {
      loading = false;
    }
  }

  async function performUpgrade() {
    if (!githubService) {
      error = 'GitHub Service not initialized. Initialize service first.';
      return;
    }

    loading = true;
    error = '';
    successMessage = '';

    try {
      // Attempt to upgrade to GitHub App
      const upgraded = await githubService.upgradeToGitHubApp();

      testResults = {
        ...testResults,
        upgrade: {
          success: upgraded,
          newClientType: upgraded ? githubService.getApiClientType() : 'pat',
        },
        apiCall: 'GitHubService.upgradeToGitHubApp()',
        status: upgraded ? 200 : 409,
      };

      console.log('Upgrade attempt:', upgraded);

      if (upgraded) {
        successMessage = `Successfully upgraded to ${githubService.getApiClientType()}!`;
        // Reload repositories with new client
        await loadUserRepositories();
      } else {
        successMessage = 'Upgrade not possible or already using GitHub App';
      }
    } catch (err: any) {
      error = err.message;
      console.error('Error performing upgrade:', err);
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
    githubService = null;
    selectedRepo = '';
    repoOwner = '';
  }
</script>

<div class="github-pat-settings-app">
  <div class="section-header">
    <h3>🔑 GitHub PAT Testing (New Architecture)</h3>
    <p class="text-sm text-gray-600">
      Test GitHub operations using Personal Access Token with the new GitHubService architecture
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
    {#if githubService}
      <div class="text-xs text-orange-600 dark:text-orange-400 mt-1">
        GitHub Service: {githubService.getApiClientType()} client
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
        on:click={initializeGitHubService}
        disabled={loading || !canInitialize}
      >
        {loading ? 'Initializing...' : 'Initialize PAT Service'}
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
        disabled={loading || !githubService}
      >
        {loading ? 'Testing...' : 'Test User Profile'}
      </button>

      <button class="btn btn-outline" on:click={clearResults} disabled={loading}>
        Clear Results
      </button>
    </div>

    <!-- PAT-Specific Test Buttons -->
    <div class="pat-test-group">
      <h4>PAT-Specific Tests</h4>
      <div class="button-group">
        <button
          class="btn btn-info"
          on:click={testTokenValidation}
          disabled={loading || !githubService}
        >
          {loading ? 'Testing...' : 'Test Token Validation'}
        </button>

        <button
          class="btn btn-warning"
          on:click={testUpgradeCheck}
          disabled={loading || !githubService}
        >
          {loading ? 'Checking...' : 'Check Upgrade Options'}
        </button>

        <button
          class="btn btn-upgrade"
          on:click={performUpgrade}
          disabled={loading || !githubService}
        >
          {loading ? 'Upgrading...' : 'Try Upgrade to GitHub App'}
        </button>
      </div>
      <div class="help-text">
        <strong>✅ PAT Advantage:</strong> Direct access to user endpoints and all repositories you have
        permissions to.
      </div>
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
                <option
                  value={repo.html_url ? repo.html_url.split('/').slice(-2).join('/') : repo.name}
                >
                  {repo.name}
                  {repo.private ? '🔒' : '🌐'}
                  {#if repo.language}({repo.language}){/if}
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
            disabled={loading || !githubService || !selectedRepo}
          >
            {loading ? 'Testing...' : 'Test Repo Access'}
          </button>

          <button
            class="btn btn-info"
            on:click={testRepoContents}
            disabled={loading || !githubService || !selectedRepo}
          >
            {loading ? 'Testing...' : 'Test Repo Contents'}
          </button>

          <button
            class="btn btn-info"
            on:click={testIssues}
            disabled={loading || !githubService || !selectedRepo}
          >
            {loading ? 'Testing...' : 'Test Issues'}
          </button>

          <button
            class="btn btn-info"
            on:click={testCommits}
            disabled={loading || !githubService || !selectedRepo}
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
            <span class="label">Current Auth Method:</span>
            <span class="value">{authStatus.currentAuth || 'Unknown'}</span>
          </div>
          <div class="status-row">
            <span class="label">Can Upgrade to GitHub App:</span>
            <span class="value status-{authStatus.canUpgradeToGitHubApp ? 'success' : 'error'}">
              {authStatus.canUpgradeToGitHubApp ? 'Yes' : 'No'}
            </span>
          </div>
          <div class="status-row">
            <span class="label">Recommend Upgrade:</span>
            <span class="value status-{authStatus.recommendUpgrade ? 'success' : 'error'}">
              {authStatus.recommendUpgrade ? 'Yes' : 'No'}
            </span>
          </div>
          {#if authStatus.rateLimits}
            <div class="rate-limits-info">
              <span class="label">Rate Limits Available:</span>
              {#if authStatus.rateLimits.githubApp}
                <div class="rate-limit-item">
                  <span class="rate-type">GitHub App:</span>
                  <span class="rate-value"
                    >{authStatus.rateLimits.githubApp.remaining}/{authStatus.rateLimits.githubApp
                      .limit}</span
                  >
                </div>
              {/if}
              {#if authStatus.rateLimits.pat}
                <div class="rate-limit-item">
                  <span class="rate-type">PAT:</span>
                  <span class="rate-value"
                    >{authStatus.rateLimits.pat.remaining}/{authStatus.rateLimits.pat.limit}</span
                  >
                </div>
              {/if}
            </div>
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
            <span class="value">{testResults.clientType || 'PAT-based'}</span>
          </div>

          <!-- Token Validation Results -->
          {#if testResults.tokenValidation}
            <div class="test-row">
              <span class="label">Token Valid:</span>
              <span
                class="value status-{testResults.tokenValidation.isValid ? 'success' : 'error'}"
              >
                {testResults.tokenValidation.isValid ? 'Yes' : 'No'}
              </span>
            </div>
          {/if}

          <!-- Upgrade Check Results -->
          {#if testResults.upgradeCheck}
            <div class="test-row">
              <span class="label">Can Upgrade:</span>
              <span
                class="value status-{testResults.upgradeCheck.canUpgradeToGitHubApp
                  ? 'success'
                  : 'info'}"
              >
                {testResults.upgradeCheck.canUpgradeToGitHubApp ? 'Yes' : 'No'}
              </span>
            </div>
            <div class="test-row">
              <span class="label">Recommend Upgrade:</span>
              <span
                class="value status-{testResults.upgradeCheck.recommendUpgrade
                  ? 'success'
                  : 'info'}"
              >
                {testResults.upgradeCheck.recommendUpgrade ? 'Yes' : 'No'}
              </span>
            </div>
          {/if}

          <!-- Upgrade Results -->
          {#if testResults.upgrade}
            <div class="test-row">
              <span class="label">Upgrade Success:</span>
              <span class="value status-{testResults.upgrade.success ? 'success' : 'error'}">
                {testResults.upgrade.success ? 'Yes' : 'No'}
              </span>
            </div>
            {#if testResults.upgrade.success}
              <div class="test-row">
                <span class="label">New Client Type:</span>
                <span class="value">{testResults.upgrade.newClientType}</span>
              </div>
            {/if}
          {/if}

          <!-- User Profile Results -->
          {#if testResults.userProfile}
            <div class="test-row">
              <span class="label">Profile Retrieved:</span>
              <span class="value">
                {testResults.userProfile.login} ({testResults.userProfile.type})
              </span>
            </div>
          {/if}

          <!-- Repository Info -->
          {#if testResults.repoInfo}
            <div class="test-row">
              <span class="label">Repository:</span>
              <span class="value">{testResults.repoInfo.name}</span>
            </div>
            <div class="test-row">
              <span class="label">Exists:</span>
              <span class="value status-{testResults.repoInfo.exists ? 'success' : 'error'}">
                {testResults.repoInfo.exists ? 'Yes' : 'No'}
              </span>
            </div>
            {#if testResults.repoInfo.description}
              <div class="test-row">
                <span class="label">Description:</span>
                <span class="value">{testResults.repoInfo.description}</span>
              </div>
            {/if}
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
  /* Keep all existing styles and add new ones for the upgrade functionality */
  .github-pat-settings-app {
    padding: 16px;
    background: #f8fafc;
    border-radius: 8px;
    margin: 16px 0;
    border: 1px solid #e2e8f0;
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
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .auth-status {
    padding: 8px 12px;
    background: white;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
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

  .pat-status {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px;
    margin: 16px 0;
    @media (prefers-color-scheme: dark) {
      background: #334155;
      border-color: #475569;
    }
  }

  .pat-status h4 {
    margin: 0 0 12px 0;
    color: #1e293b;
    font-size: 14px;
    font-weight: 600;
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
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
    @media (prefers-color-scheme: dark) {
      background: #064e3b;
      border-color: #059669;
    }
  }

  .token-not-found {
    background: #fef2f2;
    border: 1px solid #fecaca;
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
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .status-description {
    font-size: 13px;
    color: #6b7280;
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
    @media (prefers-color-scheme: dark) {
      background: #1e3a8a;
      border-color: #3b82f6;
    }
  }

  .auth-method-display .label {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
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
    @media (prefers-color-scheme: dark) {
      background: #d97706;
      color: #fed7aa;
    }
  }

  .auth-method-github_app {
    background: #10b981;
    color: white;
    @media (prefers-color-scheme: dark) {
      background: #059669;
      color: #bbf7d0;
    }
  }

  .method-note {
    font-size: 11px;
    color: #6b7280;
    font-style: italic;
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
    @media (prefers-color-scheme: dark) {
      background: #064e3b;
      border-color: #059669;
      color: #bbf7d0;
    }
  }

  .controls {
    margin: 16px 0;
  }

  .pat-test-group {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px;
    margin: 16px 0;
    @media (prefers-color-scheme: dark) {
      background: #334155;
      border-color: #475569;
    }
  }

  .pat-test-group h4 {
    margin: 0 0 12px 0;
    color: #1e293b;
    font-size: 14px;
    font-weight: 600;
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .repo-config {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 12px;
    margin: 16px 0;
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
    @media (prefers-color-scheme: dark) {
      background: #064e3b;
      border-color: #059669;
    }
  }

  .repo-owner-display .label {
    font-size: 13px;
    font-weight: 500;
    color: #374151;
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .repo-owner-display .value {
    font-family: monospace;
    font-size: 13px;
    font-weight: 600;
    color: #16a34a;
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

  .btn-warning {
    background: #f59e0b;
    color: white;
  }

  .btn-warning:hover:not(:disabled) {
    background: #d97706;
  }

  .btn-upgrade {
    background: #8b5cf6;
    color: white;
  }

  .btn-upgrade:hover:not(:disabled) {
    background: #7c3aed;
  }

  .btn-outline {
    background: white;
    color: #374151;
    border: 1px solid #d1d5db;
    @media (prefers-color-scheme: dark) {
      background: #334155;
      color: #e2e8f0;
      border-color: #475569;
    }
  }

  .btn-outline:hover:not(:disabled) {
    background: #f9fafb;
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
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .value {
    font-family: monospace;
    font-size: 12px;
    color: #6b7280;
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

  .status-info {
    color: #3b82f6;
  }

  .status-closed {
    color: #7c3aed;
  }

  .rate-limits-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .rate-limit-item {
    display: flex;
    gap: 8px;
    font-size: 12px;
  }

  .rate-type {
    font-weight: 500;
    color: #374151;
    @media (prefers-color-scheme: dark) {
      color: #e2e8f0;
    }
  }

  .rate-value {
    font-family: monospace;
    color: #6b7280;
    @media (prefers-color-scheme: dark) {
      color: #94a3b8;
    }
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
    @media (prefers-color-scheme: dark) {
      background: #1e293b;
    }
  }

  .issue-number,
  .commit-sha {
    font-weight: 600;
    color: #3b82f6;
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
    @media (prefers-color-scheme: dark) {
      color: #94a3b8;
    }
  }

  .text-green-600 {
    color: #16a34a;
    @media (prefers-color-scheme: dark) {
      color: #bbf7d0;
    }
  }

  .text-orange-600 {
    color: #ea580c;
    @media (prefers-color-scheme: dark) {
      color: #fdba74;
    }
  }
</style>
