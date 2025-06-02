<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from '$lib/components/ui/button';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '$lib/components/ui/card';
  import { Alert, AlertDescription } from '$lib/components/ui/alert';
  import { Github, CheckCircle, Loader2, AlertTriangle } from 'lucide-svelte';
  import { GitHubService } from '../../../services/GitHubService';
  import { premiumStatusStore, isAuthenticated } from '$lib/stores';

  export let onAuthenticationSelected: (method: 'github_app', token?: string) => void;
  export let showAsCard: boolean = true;

  // State management
  let loading = false;
  let authStatus: any = null;
  let isCheckingStatus = false;
  let connectionError: string | null = null;

  // Premium status
  $: premiumStatus = $premiumStatusStore;
  $: isUserAuthenticated = $isAuthenticated;

  onMount(async () => {
    await checkGitHubAppStatus();
  });

  async function checkGitHubAppStatus() {
    isCheckingStatus = true;
    try {
      authStatus = await GitHubService.getAuthenticationStatus();
    } catch (error) {
      console.error('Error checking GitHub App status:', error);
    } finally {
      isCheckingStatus = false;
    }
  }

  async function handleConnect() {
    loading = true;
    connectionError = null;

    try {
      // Check if GitHub App is already connected
      if (authStatus?.hasGitHubApp) {
        onAuthenticationSelected('github_app');
      } else {
        // Redirect to GitHub App installation/authorization
        const connectUrl = 'https://bolt2github.com/dashboard?tab=github&action=connect';
        await chrome.tabs.create({ url: connectUrl });
      }
    } catch (error) {
      console.error('Error connecting to GitHub:', error);
      connectionError = 'Failed to connect to GitHub. Please try again.';
    } finally {
      loading = false;
    }
  }
</script>

{#if showAsCard}
  <Card class="w-full max-w-md mx-auto">
    <CardHeader class="text-center">
      <CardTitle class="flex items-center justify-center gap-2">
        <Github class="h-5 w-5" />
        Connect to GitHub
      </CardTitle>
      <CardDescription>Securely connect your GitHub account to get started</CardDescription>
    </CardHeader>

    <CardContent>
      {#if isCheckingStatus}
        <!-- Loading State -->
        <div class="text-center py-8">
          <Loader2 class="h-8 w-8 animate-spin mx-auto mb-2 text-blue-500" />
          <p class="text-sm text-gray-600 dark:text-gray-400">Checking connection status...</p>
        </div>
      {:else}
        <!-- Main Connection UI -->
        <div class="text-center space-y-6">
          <div
            class="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center"
          >
            <Github class="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>

          {#if authStatus?.hasGitHubApp}
            <!-- Already Connected -->
            <div class="space-y-3">
              <div
                class="flex items-center justify-center gap-2 text-green-600 dark:text-green-400"
              >
                <CheckCircle class="h-5 w-5" />
                <span class="font-medium">GitHub Connected</span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Your GitHub account is ready to use
              </p>
              <Button on:click={() => onAuthenticationSelected('github_app')} class="w-full">
                Continue
              </Button>
            </div>
          {:else}
            <!-- Not Connected -->
            <div class="space-y-4">
              <div>
                <h3 class="text-lg font-semibold mb-2">Connect Your GitHub Account</h3>
                <p class="text-sm text-gray-600 dark:text-gray-400">
                  Securely sync your projects with GitHub repositories
                </p>
              </div>

              <!-- Benefits List -->
              <div class="text-left space-y-2 max-w-xs mx-auto">
                <div class="flex items-center gap-2 text-sm">
                  <CheckCircle class="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>Secure OAuth authentication</span>
                </div>
                <div class="flex items-center gap-2 text-sm">
                  <CheckCircle class="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>Automatic repository management</span>
                </div>
                <div class="flex items-center gap-2 text-sm">
                  <CheckCircle class="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>Seamless project synchronization</span>
                </div>
              </div>

              <!-- Authentication Required Notice -->
              {#if !isUserAuthenticated}
                <Alert class="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                  <AlertTriangle class="h-4 w-4 text-blue-600" />
                  <AlertDescription class="text-blue-800 dark:text-blue-200 text-sm">
                    You'll be redirected to sign in to Bolt to GitHub first, then connect your
                    GitHub account.
                  </AlertDescription>
                </Alert>
              {/if}

              <!-- Connect Button -->
              <Button on:click={handleConnect} disabled={loading} class="w-full" size="lg">
                {#if loading}
                  <Loader2 class="h-4 w-4 animate-spin mr-2" />
                  Connecting...
                {:else}
                  <Github class="h-4 w-4 mr-2" />
                  {isUserAuthenticated ? 'Connect GitHub' : 'Sign In & Connect'}
                {/if}
              </Button>

              <!-- Error Display -->
              {#if connectionError}
                <Alert variant="destructive" class="text-sm">
                  <AlertTriangle class="h-4 w-4" />
                  <AlertDescription>
                    {connectionError}
                    <Button size="sm" variant="outline" on:click={handleConnect} class="ml-2">
                      Try Again
                    </Button>
                  </AlertDescription>
                </Alert>
              {/if}

              <!-- Help Text -->
              <p class="text-xs text-gray-500 dark:text-gray-400">
                By connecting, you agree to our secure integration with GitHub
              </p>
            </div>
          {/if}
        </div>
      {/if}
    </CardContent>
  </Card>
{:else}
  <div class="w-full space-y-4">
    {#if isCheckingStatus}
      <!-- Loading State -->
      <div class="text-center py-8">
        <Loader2 class="h-8 w-8 animate-spin mx-auto mb-2 text-blue-500" />
        <p class="text-sm text-gray-600 dark:text-gray-400">Checking connection status...</p>
      </div>
    {:else}
      <!-- Main Connection UI -->
      <div class="text-center space-y-6">
        <div
          class="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center"
        >
          <Github class="h-8 w-8 text-blue-600 dark:text-blue-400" />
        </div>

        {#if authStatus?.hasGitHubApp}
          <!-- Already Connected -->
          <div class="space-y-3">
            <div class="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle class="h-5 w-5" />
              <span class="font-medium">GitHub Connected</span>
            </div>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Your GitHub account is ready to use
            </p>
            <Button on:click={() => onAuthenticationSelected('github_app')} class="w-full">
              Continue
            </Button>
          </div>
        {:else}
          <!-- Not Connected -->
          <div class="space-y-4">
            <h3 class="text-lg font-semibold mb-2">Connect Your GitHub Account</h3>

            <!-- Authentication Required Notice -->
            {#if !isUserAuthenticated}
              <Alert class="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                <AlertTriangle class="h-4 w-4 text-blue-600" />
                <AlertDescription class="text-blue-800 dark:text-blue-200 text-sm">
                  You'll be redirected to sign in to Bolt to GitHub first, then connect your GitHub
                  account.
                </AlertDescription>
              </Alert>
            {/if}

            <!-- Connect Button -->
            <Button on:click={handleConnect} disabled={loading} class="w-full" size="lg">
              {#if loading}
                <Loader2 class="h-4 w-4 animate-spin mr-2" />
                Connecting...
              {:else}
                <Github class="h-4 w-4 mr-2" />
                {isUserAuthenticated ? 'Connect GitHub' : 'Sign In & Connect'}
              {/if}
            </Button>

            <!-- Error Display -->
            {#if connectionError}
              <Alert variant="destructive" class="text-sm">
                <AlertTriangle class="h-4 w-4" />
                <AlertDescription>
                  {connectionError}
                  <Button size="sm" variant="outline" on:click={handleConnect} class="ml-2">
                    Try Again
                  </Button>
                </AlertDescription>
              </Alert>
            {/if}

            <!-- Help Text -->
            <p class="text-xs text-gray-500 dark:text-gray-400">
              By connecting, you agree to our secure integration with GitHub
            </p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}
