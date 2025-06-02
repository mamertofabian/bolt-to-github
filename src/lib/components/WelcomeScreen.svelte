<script lang="ts">
  import GitHubConnector from '$lib/components/github/GitHubConnector.svelte';
  import { githubSettingsStore, hasGitHubAuthentication } from '$lib/stores';

  export let onAuthenticationSelected: (method: 'github_app', token?: string) => void;

  // Reactive store subscriptions
  $: githubSettings = $githubSettingsStore;
  $: hasGitHubAuth = $hasGitHubAuthentication;
</script>

<div class="flex flex-col items-center justify-center p-4 text-center space-y-6">
  <div class="space-y-4">
    <!-- Welcome Header -->
    <div class="space-y-2">
      <h2 class="text-xl font-semibold text-slate-200">Welcome to Bolt to GitHub!</h2>
      <p class="text-sm text-slate-400 max-w-md">
        Seamlessly sync your projects with GitHub repositories. Upload, manage, and version control
        your code with ease.
      </p>
    </div>

    <!-- Getting Started Steps -->
    <div class="bg-slate-800/50 rounded-lg p-4 space-y-3 max-w-md">
      <h3 class="text-sm font-medium text-slate-200 mb-3">Getting Started:</h3>
      <div class="space-y-2 text-left">
        <div class="flex items-start gap-3 text-sm">
          <span
            class="bg-blue-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5"
            >1</span
          >
          <div>
            {#if hasGitHubAuth}
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fill-rule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clip-rule="evenodd"
                  ></path>
                </svg>
                <span class="text-green-400 font-medium">GitHub Account Connected</span>
              </div>
              <p class="text-slate-400 text-xs">
                {#if githubSettings.authMethod === 'github_app'}
                  Using GitHub App authentication
                {:else if githubSettings.authMethod === 'pat'}
                  Using Personal Access Token
                {:else}
                  Connected and ready to use
                {/if}
              </p>
            {:else}
              <a
                href="https://bolt2github.com/settings?tab=github"
                target="_blank"
                class="text-slate-200 font-medium hover:text-blue-400 transition-colors cursor-pointer underline decoration-1 underline-offset-2"
              >
                Connect GitHub Account
              </a>
              <p class="text-slate-400 text-xs">Securely link your GitHub account to get started</p>
            {/if}
          </div>
        </div>
        <div class="flex items-start gap-3 text-sm">
          <span
            class="bg-slate-600 text-slate-300 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5"
            >2</span
          >
          <div>
            <p class="text-slate-300">Push Bolt.new Projects</p>
            <p class="text-slate-500 text-xs">Sync your Bolt.new projects to GitHub repositories</p>
          </div>
        </div>
        <div class="flex items-start gap-3 text-sm">
          <span
            class="bg-slate-600 text-slate-300 rounded-full w-5 h-5 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5"
            >3</span
          >
          <div>
            <p class="text-slate-300">Manage & Collaborate</p>
            <p class="text-slate-500 text-xs">Track changes and collaborate with your team</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Only show GitHubConnector if user doesn't have GitHub authentication -->
    {#if !hasGitHubAuth}
      <GitHubConnector showAsCard={false} {onAuthenticationSelected} />
    {:else}
      <div class="bg-green-500/10 border border-green-500/20 rounded-lg p-4 max-w-md">
        <div class="flex items-center gap-2 text-green-400 mb-2">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clip-rule="evenodd"
            ></path>
          </svg>
          <span class="font-medium">You're all set!</span>
        </div>
        <p class="text-sm text-slate-300">Create or load a Bolt.new project to get started.</p>
      </div>
    {/if}
  </div>
</div>
