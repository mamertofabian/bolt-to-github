<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import {
    X,
    Crown,
    Zap,
    Shield,
    CheckCircle,
    Loader2,
    TrendingUp,
    RefreshCw,
    ExternalLink,
  } from 'lucide-svelte';
  import { GitHubService } from '../../services/GitHubService';

  export let show: boolean = false;
  export let currentPatToken: string = '';
  export let currentRateLimit: any = null;

  const dispatch = createEventDispatcher<{
    close: void;
    migrated: { service: any };
    dismissed: void;
  }>();

  // State
  let loading = false;
  let migrationStep: 'prompt' | 'migrating' | 'success' | 'error' = 'prompt';
  let error: string | null = null;
  let migratedService: any = null;
  let showDetails = false;

  // Calculate potential benefits
  $: rateLimitImprovement = currentRateLimit
    ? Math.round((12500 / currentRateLimit.limit) * 100) / 100
    : 2.5;
  $: currentUsage = currentRateLimit
    ? Math.round(
        ((currentRateLimit.limit - currentRateLimit.remaining) / currentRateLimit.limit) * 100
      )
    : 0;

  async function handleMigration() {
    loading = true;
    migrationStep = 'migrating';
    error = null;

    try {
      const migrationResult = await GitHubService.migrateToGitHubApp(currentPatToken);

      if (migrationResult) {
        migratedService = migrationResult;
        migrationStep = 'success';

        // Notify parent component after a short delay to show success
        setTimeout(() => {
          dispatch('migrated', { service: migrationResult });
        }, 2000);
      } else {
        // Migration not possible - user needs to install GitHub App
        migrationStep = 'error';
        error = 'GitHub App not installed. Please install the app first.';
      }
    } catch (err) {
      console.error('Migration error:', err);
      migrationStep = 'error';
      error = err instanceof Error ? err.message : 'Migration failed';
    } finally {
      loading = false;
    }
  }

  function handleInstallApp() {
    const installUrl = 'https://bolt2github.com/dashboard?tab=github&action=install';
    chrome.tabs.create({ url: installUrl });
  }

  function handleNotNow() {
    dispatch('dismissed');
    show = false;
  }

  function handleClose() {
    dispatch('close');
    show = false;
  }

  // Close on escape key
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      handleClose();
    }
  }

  function formatNumber(num: number): string {
    return num.toLocaleString();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <!-- Modal Backdrop -->
  <div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
    <!-- Modal Content -->
    <Card class="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <CardHeader>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Crown class="h-6 w-6 text-yellow-500" />
            <CardTitle>Migrate to GitHub App</CardTitle>
          </div>
          <Button variant="ghost" size="sm" on:click={handleClose}>
            <X class="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>
          Get 2.5× higher rate limits and enhanced features with GitHub App integration
        </CardDescription>
      </CardHeader>

      <CardContent class="space-y-6">
        {#if migrationStep === 'prompt'}
          <!-- Benefits Comparison -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Current PAT -->
            <Card class="border-yellow-200 dark:border-yellow-800">
              <CardContent class="p-4">
                <div class="flex items-center gap-2 mb-3">
                  <Shield class="h-5 w-5 text-purple-500" />
                  <span class="font-semibold">Your Current Setup</span>
                  <Badge variant="outline">PAT</Badge>
                </div>
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span>Rate Limit:</span>
                    <span class="font-mono"
                      >{formatNumber(currentRateLimit?.limit || 5000)}/hour</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span>Remaining:</span>
                    <span class="font-mono {currentUsage > 80 ? 'text-red-500' : ''}">
                      {formatNumber(currentRateLimit?.remaining || 0)}
                    </span>
                  </div>
                  <div class="flex justify-between">
                    <span>Usage:</span>
                    <span class="font-mono">{currentUsage}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <!-- GitHub App Benefits -->
            <Card class="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
              <CardContent class="p-4">
                <div class="flex items-center gap-2 mb-3">
                  <Zap class="h-5 w-5 text-blue-500" />
                  <span class="font-semibold">With GitHub App</span>
                  <Badge class="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">
                    Recommended
                  </Badge>
                </div>
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span>Rate Limit:</span>
                    <span class="font-mono text-green-600 dark:text-green-400">12,500/hour</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Improvement:</span>
                    <span class="font-mono text-green-600 dark:text-green-400">
                      +{formatNumber(12500 - (currentRateLimit?.limit || 5000))}
                    </span>
                  </div>
                  <div class="flex justify-between">
                    <span>Multiplier:</span>
                    <span class="font-mono text-green-600 dark:text-green-400">
                      {rateLimitImprovement}×
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <!-- Feature Comparison -->
          <div class="space-y-3">
            <h3 class="font-semibold text-lg">Additional Benefits</h3>
            <div class="grid gap-3">
              <div
                class="flex items-center gap-3 p-3 border rounded-lg bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
              >
                <CheckCircle class="h-5 w-5 text-green-500" />
                <div>
                  <div class="font-medium">Higher Rate Limits</div>
                  <div class="text-sm text-gray-600 dark:text-gray-400">
                    12,500 requests/hour vs 5,000 - perfect for large projects
                  </div>
                </div>
              </div>

              <div
                class="flex items-center gap-3 p-3 border rounded-lg bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800"
              >
                <RefreshCw class="h-5 w-5 text-blue-500" />
                <div>
                  <div class="font-medium">Automatic Token Management</div>
                  <div class="text-sm text-gray-600 dark:text-gray-400">
                    No more manual token creation or expiration worries
                  </div>
                </div>
              </div>

              <div
                class="flex items-center gap-3 p-3 border rounded-lg bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800"
              >
                <Shield class="h-5 w-5 text-purple-500" />
                <div>
                  <div class="font-medium">Enhanced Security</div>
                  <div class="text-sm text-gray-600 dark:text-gray-400">
                    Fine-grained permissions and secure OAuth flow
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex flex-col sm:flex-row gap-3">
            <Button on:click={handleMigration} disabled={loading} class="flex-1">
              {#if loading}
                <Loader2 class="h-4 w-4 animate-spin mr-2" />
              {/if}
              <Crown class="h-4 w-4 mr-2" />
              Migrate Now
            </Button>

            <Button variant="outline" on:click={handleNotNow} class="flex-1">Maybe Later</Button>
          </div>
        {:else if migrationStep === 'migrating'}
          <!-- Migration in Progress -->
          <div class="text-center py-8 space-y-4">
            <Loader2 class="h-12 w-12 animate-spin mx-auto text-blue-500" />
            <div>
              <h3 class="text-lg font-semibold">Migrating to GitHub App...</h3>
              <p class="text-gray-600 dark:text-gray-400">
                Checking your GitHub App installation and setting up authentication
              </p>
            </div>
          </div>
        {:else if migrationStep === 'success'}
          <!-- Migration Success -->
          <div class="text-center py-8 space-y-4">
            <CheckCircle class="h-12 w-12 mx-auto text-green-500" />
            <div>
              <h3 class="text-lg font-semibold text-green-700 dark:text-green-300">
                Migration Successful!
              </h3>
              <p class="text-gray-600 dark:text-gray-400">
                You're now using GitHub App with 12,500 requests/hour
              </p>
            </div>

            <!-- Success Benefits -->
            <div
              class="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4"
            >
              <div class="flex items-center gap-2 mb-2">
                <TrendingUp class="h-4 w-4 text-green-600" />
                <span class="font-medium text-green-800 dark:text-green-200"
                  >Immediate Benefits</span
                >
              </div>
              <div class="text-sm text-green-700 dark:text-green-300 space-y-1">
                <div>• Rate limit increased to 12,500/hour</div>
                <div>• Automatic token management</div>
                <div>• Enhanced security</div>
              </div>
            </div>
          </div>
        {:else if migrationStep === 'error'}
          <!-- Migration Error -->
          <div class="text-center py-8 space-y-4">
            <div
              class="h-12 w-12 mx-auto bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center"
            >
              <X class="h-6 w-6 text-red-500" />
            </div>
            <div>
              <h3 class="text-lg font-semibold text-red-700 dark:text-red-300">
                Installation Required
              </h3>
              <p class="text-gray-600 dark:text-gray-400">
                You need to install the Bolt to GitHub App first
              </p>
            </div>

            <Alert class="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
              <AlertDescription class="text-blue-800 dark:text-blue-200">
                <div class="space-y-2">
                  <div><strong>Next Steps:</strong></div>
                  <div>1. Install the GitHub App on your repositories</div>
                  <div>2. Grant necessary permissions</div>
                  <div>3. Return here to complete the migration</div>
                </div>
              </AlertDescription>
            </Alert>

            <div class="flex flex-col sm:flex-row gap-3">
              <Button on:click={handleInstallApp} class="flex-1">
                <ExternalLink class="h-4 w-4 mr-2" />
                Install GitHub App
              </Button>
              <Button variant="outline" on:click={handleClose} class="flex-1">Close</Button>
            </div>
          </div>
        {/if}
      </CardContent>
    </Card>
  </div>
{/if}

<style>
  /* Ensure modal is on top */
  :global(.modal-backdrop) {
    z-index: 9999;
  }
</style>
