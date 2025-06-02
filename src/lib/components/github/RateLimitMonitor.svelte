<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import {
    AlertTriangle,
    Zap,
    Clock,
    TrendingUp,
    RefreshCw,
    Crown,
    ExternalLink,
  } from 'lucide-svelte';
  import { GitHubService } from '../../../services/GitHubService';
  import { Progress } from '../ui/progress';

  export let githubToken: string = '';
  export let checkInterval: number = 300000; // 5 minutes
  export let onMigrateRequested: (() => void) | null = null;
  export let showMigratePrompt: boolean = true;

  // Rate limit thresholds
  const WARNING_THRESHOLD = 0.2; // 20% remaining
  const CRITICAL_THRESHOLD = 0.1; // 10% remaining

  // State
  let rateLimitStatus: any = null;
  let lastCheck: Date | null = null;
  let loading = false;
  let error: string | null = null;
  let intervalId: number | null = null;
  let apiClientType: 'pat' | 'github_app' | 'unknown' = 'unknown';

  // Reactive calculations
  $: currentLimit = rateLimitStatus?.currentRateLimit;
  $: isLowLimit = currentLimit && currentLimit.remaining / currentLimit.limit <= WARNING_THRESHOLD;
  $: isCriticalLimit =
    currentLimit && currentLimit.remaining / currentLimit.limit <= CRITICAL_THRESHOLD;
  $: usagePercentage = currentLimit
    ? Math.round(((currentLimit.limit - currentLimit.remaining) / currentLimit.limit) * 100)
    : 0;
  $: remainingPercentage = currentLimit
    ? Math.round((currentLimit.remaining / currentLimit.limit) * 100)
    : 100;

  onMount(async () => {
    if (githubToken) {
      await checkRateLimit();
      startMonitoring();
    }
  });

  onDestroy(() => {
    stopMonitoring();
  });

  // Watch for token changes
  $: if (githubToken) {
    checkRateLimit();
    if (!intervalId) {
      startMonitoring();
    }
  } else {
    stopMonitoring();
    rateLimitStatus = null;
  }

  async function checkRateLimit() {
    if (!githubToken) return;

    loading = true;
    error = null;

    try {
      // Get authentication status which includes rate limits
      const authStatus = await GitHubService.getAuthenticationStatus(githubToken);
      rateLimitStatus = authStatus;

      // Determine API client type
      if (authStatus.hasGitHubApp && authStatus.recommended === 'github_app') {
        apiClientType = 'github_app';
      } else if (authStatus.hasPAT) {
        apiClientType = 'pat';
      }

      lastCheck = new Date();
    } catch (err) {
      console.error('Error checking rate limit:', err);
      error = 'Failed to check rate limit status';
    } finally {
      loading = false;
    }
  }

  function startMonitoring() {
    if (intervalId) return;

    intervalId = setInterval(async () => {
      await checkRateLimit();
    }, checkInterval) as unknown as number;
  }

  function stopMonitoring() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function formatTimeUntilReset(resetTimestamp: number): string {
    const resetTime = new Date(resetTimestamp * 1000);
    const now = new Date();
    const diffMs = resetTime.getTime() - now.getTime();

    if (diffMs <= 0) return 'Now';

    const diffMinutes = Math.ceil(diffMs / (1000 * 60));

    if (diffMinutes < 60) {
      return `${diffMinutes}m`;
    } else {
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
  }

  function getAlertVariant(): 'default' | 'destructive' {
    if (isCriticalLimit) return 'destructive';
    return 'default';
  }

  function getAlertColor(): string {
    if (isCriticalLimit) return 'red';
    if (isLowLimit) return 'yellow';
    return 'blue';
  }

  function handleMigrate() {
    if (onMigrateRequested) {
      onMigrateRequested();
    } else {
      // Default migrate action - open settings
      const migrateUrl = 'https://bolt2github.com/settings?tab=github&action=migrate';
      chrome.tabs.create({ url: migrateUrl });
    }
  }
</script>

{#if githubToken}
  <div class="space-y-3">
    <!-- Rate Limit Status Display -->
    <div class="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
      <!-- Header Row -->
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          {#if apiClientType === 'github_app'}
            <Zap class="h-4 w-4 text-blue-500" />
            <span class="font-medium">GitHub App Rate Limit</span>
            <Badge variant="secondary" class="text-xs">12.5K/hour</Badge>
          {:else}
            <Clock class="h-4 w-4 text-purple-500" />
            <span class="font-medium">PAT Rate Limit</span>
            <Badge variant="outline" class="text-xs">5K/hour</Badge>
          {/if}
        </div>
      </div>

      <!-- Status and Actions Row -->
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          {#if loading}
            <RefreshCw class="h-3 w-3 animate-spin" />
            <span>Checking...</span>
          {:else if lastCheck}
            <span>Updated {lastCheck.toLocaleTimeString()}</span>
          {:else}
            <span>Not checked yet</span>
          {/if}
        </div>
        <Button size="sm" variant="outline" on:click={checkRateLimit}>
          <RefreshCw class="h-3 w-3 mr-1" />
          Check Now
        </Button>
      </div>

      {#if loading && !currentLimit}
        <!-- Loading State -->
        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span>Loading rate limit data...</span>
          </div>
          <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
        </div>
      {:else if currentLimit}
        <!-- Progress Bar -->
        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span>Usage: {usagePercentage}%</span>
            <span class="font-mono">
              {currentLimit.remaining.toLocaleString()}/{currentLimit.limit.toLocaleString()}
            </span>
          </div>

          <Progress
            value={usagePercentage}
            className="h-2 {isCriticalLimit
              ? 'bg-red-200'
              : isLowLimit
                ? 'bg-yellow-200'
                : 'bg-blue-200'}"
          />

          {#if currentLimit.reset}
            <div class="text-xs text-gray-500 dark:text-gray-400">
              Resets in {formatTimeUntilReset(currentLimit.reset)}
            </div>
          {/if}
        </div>
      {:else if !loading}
        <!-- No Rate Limit Data -->
        <div class="space-y-2">
          <div class="text-sm text-gray-600 dark:text-gray-400">
            Rate limit data not available yet.
          </div>
        </div>
      {/if}
    </div>

    <!-- Show migration option only for PAT users -->
    {#if showMigratePrompt && apiClientType === 'pat'}
      <Alert class="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
        <TrendingUp class="h-4 w-4 text-blue-600" />
        <AlertDescription class="text-blue-800 dark:text-blue-200">
          <div class="flex items-center justify-between">
            <div>
              <div><strong>GitHub App Available</strong></div>
              <div class="text-sm">
                {#if rateLimitStatus?.canUseGitHubApp === false}
                  GitHub App setup required for higher rate limits
                {:else}
                  Migrate to 12,500 requests/hour (2.5× your current limit)
                {/if}
              </div>
            </div>
            <Button size="sm" variant="outline" on:click={handleMigrate}>
              <Crown class="h-3 w-3 mr-2" />
              {#if rateLimitStatus?.canUseGitHubApp === false}
                Setup
              {:else}
                Migrate
              {/if}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    {:else if apiClientType === 'github_app'}
      <!-- Success indicator for GitHub App users -->
      <Alert class="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
        <Crown class="h-4 w-4 text-green-600" />
        <AlertDescription class="text-green-800 dark:text-green-200">
          <div class="flex items-center justify-between">
            <div>
              <div><strong>GitHub App Active</strong></div>
              <div class="text-sm">
                You're using the preferred authentication method with 2.5× higher rate limits
              </div>
            </div>
            <Badge
              variant="secondary"
              class="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
            >
              Optimized
            </Badge>
          </div>
        </AlertDescription>
      </Alert>
    {/if}

    <!-- Rate Limit Warnings (only when actually approaching limits) -->
    {#if currentLimit}
      {#if isCriticalLimit}
        <Alert
          variant="destructive"
          class="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
        >
          <AlertTriangle class="h-4 w-4" />
          <AlertDescription>
            <div class="space-y-2">
              <div>
                <strong>Critical: Rate limit nearly exhausted!</strong>
              </div>
              <div class="text-sm">
                Only {remainingPercentage}% of requests remaining. API requests will be blocked
                soon.
              </div>
              {#if showMigratePrompt && apiClientType === 'pat'}
                <div class="text-sm font-medium">
                  💡 Consider migrating to GitHub App for immediate relief with 2.5× higher limits.
                </div>
              {/if}
            </div>
          </AlertDescription>
        </Alert>
      {:else if isLowLimit}
        <Alert class="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
          <AlertTriangle class="h-4 w-4 text-yellow-600" />
          <AlertDescription class="text-yellow-800 dark:text-yellow-200">
            <div class="space-y-2">
              <div>
                <strong>Warning: Rate limit running low</strong>
              </div>
              <div class="text-sm">
                {remainingPercentage}% of requests remaining. Consider pacing your usage.
              </div>
            </div>
          </AlertDescription>
        </Alert>
      {/if}
    {/if}

    <!-- Error Display -->
    {#if error}
      <Alert variant="destructive">
        <AlertTriangle class="h-4 w-4" />
        <AlertDescription>
          {error}
          <Button size="sm" variant="outline" on:click={checkRateLimit} class="ml-2">
            <RefreshCw class="h-3 w-3 mr-1" />
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    {/if}
  </div>
{/if}
