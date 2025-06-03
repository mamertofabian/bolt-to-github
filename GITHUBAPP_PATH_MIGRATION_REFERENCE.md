# GitHub Authentication Migration Reference

## Overview

This document provides technical guidance for migrating existing components from PAT-only authentication to support both GitHub App and PAT authentication using the GitHubApiClientFactory pattern.

## Authentication Priority

1. **GitHub App** (preferred - higher rate limits, better security)
2. **Personal Access Token** (fallback - backward compatibility)
3. **No Authentication** (graceful degradation)

## Core Patterns

### 1. Store Integration

```typescript
import { githubSettingsStore, githubSettingsActions } from '$lib/stores/githubSettingsStore';
import { GitHubApiClientFactory } from '../../services/GitHubApiClientFactory';
import type { IGitHubApiClient } from '../../services/interfaces/IGitHubApiClient';

// Reactive store subscriptions
$: githubSettings = $githubSettingsStore;
$: hasGitHubApp = githubSettings.githubAppStatus.hasInstallationToken;
$: hasPAT = Boolean(githubSettings.githubToken);
$: hasAuthentication = hasGitHubApp || hasPAT;
$: authMethod = githubSettings.authMethod; // 'github_app' | 'pat' | 'unknown'
```

### 2. Component Initialization

```typescript
let githubApiClient: IGitHubApiClient | null = null;
let loading = false;
let error = '';

onMount(async () => {
  // Initialize GitHub settings to load stored authentication
  await githubSettingsActions.initialize();

  // Auto-initialize client if authentication is available
  if (hasAuthentication) {
    await initializeGitHubClient();
  }
});

async function initializeGitHubClient() {
  if (!hasAuthentication) {
    error = 'No GitHub authentication available';
    return;
  }

  loading = true;
  error = '';

  try {
    if (hasGitHubApp) {
      // Preferred: Use GitHub App
      githubApiClient = await GitHubApiClientFactory.createApiClientForNewUser();
    } else if (hasPAT) {
      // Fallback: Use PAT
      githubApiClient = await GitHubApiClientFactory.createApiClientForExistingUser(
        githubSettings.githubToken,
        true // Allow upgrade to GitHub App if available
      );
    }

    console.log(`GitHub client initialized using ${authMethod}`);
  } catch (err: any) {
    error = err.message;
    console.error('Error initializing GitHub client:', err);
  } finally {
    loading = false;
  }
}
```

### 3. Migrating from GitHubService

**Before (PAT-only):**

```typescript
const githubService = new GitHubService(githubToken);
const repos = await githubService.listRepos();
```

**After (GitHub App + PAT):**

```typescript
// Initialize client (once per component)
await initializeGitHubClient();

// Use client for API calls
const repos = await githubApiClient?.request('GET', '/user/repos?sort=updated&per_page=50');
```

### 4. API Call Patterns

```typescript
// Repository operations
async function loadRepositories() {
  if (!githubApiClient) {
    await initializeGitHubClient();
  }

  try {
    const repos = await githubApiClient.request('GET', '/user/repos?sort=updated&per_page=50');
    return repos;
  } catch (error) {
    console.error('Failed to load repositories:', error);
    throw error;
  }
}

// Repository contents
async function getRepoContents(owner: string, repo: string, path: string = '') {
  const contents = await githubApiClient.request('GET', `/repos/${owner}/${repo}/contents/${path}`);
  return contents;
}

// Commit operations
async function getCommits(owner: string, repo: string, branch: string) {
  const commits = await githubApiClient.request(
    'GET',
    `/repos/${owner}/${repo}/commits?sha=${branch}&per_page=10`
  );
  return commits;
}

// Issues
async function getIssues(owner: string, repo: string) {
  const issues = await githubApiClient.request(
    'GET',
    `/repos/${owner}/${repo}/issues?state=open&per_page=20`
  );
  return issues;
}
```

### 5. Error Handling

```typescript
async function performGitHubOperation() {
  try {
    if (!githubApiClient) {
      throw new Error('GitHub client not initialized');
    }

    const result = await githubApiClient.request('GET', '/some/endpoint');
    return result;
  } catch (error: any) {
    if (error.message.includes('404')) {
      // Handle specific GitHub errors
      throw new Error('Resource not found or access denied');
    } else if (error.message.includes('rate limit')) {
      // Handle rate limiting
      throw new Error('Rate limit exceeded. Please try again later.');
    } else {
      // Generic error handling
      throw new Error(`GitHub operation failed: ${error.message}`);
    }
  }
}
```

### 6. Authentication Status Display

```typescript
// Component template
{#if hasGitHubApp}
  <div class="auth-status github-app">
    ✅ Using GitHub App (Recommended)
  </div>
{:else if hasPAT}
  <div class="auth-status pat">
    ⚠️ Using Personal Access Token
    <button on:click={showUpgradePrompt}>Upgrade to GitHub App</button>
  </div>
{:else}
  <div class="auth-status none">
    ❌ No GitHub authentication
    <button on:click={openSettings}>Configure Authentication</button>
  </div>
{/if}
```

### 7. Prop Migration

**Before (PAT props):**

```typescript
export let repoOwner: string;
export let githubToken: string;
```

**After (Store-based):**

```typescript
// Remove props, use store instead
$: repoOwner = githubSettings.repoOwner;
$: githubToken = githubSettings.githubToken; // Still available for legacy operations
```

### 8. Reactive Updates

```typescript
// Watch for authentication changes
$: if (githubSettings.authMethod && githubSettings.authMethod !== 'unknown') {
  // Re-initialize client when auth method changes
  initializeGitHubClient();
}

// Watch for GitHub App status changes
$: if (githubSettings.githubAppStatus.hasInstallationToken) {
  // Prefer GitHub App if it becomes available
  if (authMethod !== 'github_app') {
    initializeGitHubClient();
  }
}
```

## Migration Checklist

### Phase 1: Store Integration

- [ ] Import `githubSettingsStore` and `githubSettingsActions`
- [ ] Add reactive store subscriptions
- [ ] Initialize store in `onMount`

### Phase 2: Client Setup

- [ ] Replace `GitHubService` with `IGitHubApiClient`
- [ ] Add `initializeGitHubClient()` function
- [ ] Implement authentication detection logic

### Phase 3: API Migration

- [ ] Replace `githubService.method()` calls with `githubApiClient.request()`
- [ ] Update error handling for new API patterns
- [ ] Test both GitHub App and PAT flows

### Phase 4: UI Updates

- [ ] Add authentication status indicators
- [ ] Show upgrade prompts for PAT users
- [ ] Handle loading states during client initialization

### Phase 5: Cleanup

- [ ] Remove old PAT props
- [ ] Clean up unused GitHubService imports
- [ ] Update TypeScript types

## Common Gotchas

1. **Rate Limits**: GitHub App has higher limits than PAT
2. **Repository Access**: GitHub App only works with installed repositories
3. **User Endpoint**: PAT can access `/user`, GitHub App installation tokens cannot
4. **Initialization Timing**: Always check if client is initialized before API calls
5. **Store Updates**: Use `githubSettingsActions` for store mutations, not direct updates

## Testing Strategy

```typescript
// Test both authentication methods
async function testAuthentication() {
  console.log('Testing GitHub App...');
  try {
    const appClient = await GitHubApiClientFactory.createApiClientForNewUser();
    const appRepos = await appClient.request('GET', '/installation/repositories');
    console.log('GitHub App works:', appRepos.repositories.length, 'repos');
  } catch (error) {
    console.log('GitHub App failed:', error.message);
  }

  console.log('Testing PAT...');
  try {
    const patClient = await GitHubApiClientFactory.createApiClientForExistingUser(
      githubSettings.githubToken,
      false
    );
    const patRepos = await patClient.request('GET', '/user/repos?per_page=5');
    console.log('PAT works:', patRepos.length, 'repos');
  } catch (error) {
    console.log('PAT failed:', error.message);
  }
}
```

This reference provides the foundation for migrating any component from PAT-only to dual GitHub App + PAT support while maintaining backward compatibility.
