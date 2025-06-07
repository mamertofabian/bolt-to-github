<script>
  import { TUTORIAL_LINK, GITHUB_APP_AUTH_URL } from '$lib/constants';
  import {
    AlertCircle,
    ChevronUp,
    ChevronDown,
    ExternalLink,
    Youtube,
    Github,
    Shield,
    Lock,
    Sparkles,
    RefreshCw,
    Settings,
  } from 'lucide-svelte';
  import {
    GITHUB_SIGNUP_URL,
    CREATE_TOKEN_URL,
    CREATE_FINE_GRAINED_TOKEN_URL,
  } from '../../../services/GitHubService';
  import { Button } from '$lib/components/ui/button';
  import { onMount } from 'svelte';

  let showNewUserGuide = true;

  function toggleNewUserGuide() {
    showNewUserGuide = !showNewUserGuide;
    chrome.storage.local.set({ showNewUserGuide });
  }

  function handleGitHubAppConnect() {
    window.open(GITHUB_APP_AUTH_URL, '_blank');
  }

  onMount(() => {
    chrome.storage.local.get(['showNewUserGuide'], (result) => {
      showNewUserGuide = result.showNewUserGuide ?? true;
    });
  });
</script>

<div class="rounded-lg bg-slate-800/50 border border-slate-700">
  <button
    on:click={toggleNewUserGuide}
    class="w-full p-4 flex items-center justify-between text-left"
  >
    <h3 class="font-medium text-slate-200 flex items-center gap-2">
      <AlertCircle size={16} />
      New to GitHub?
    </h3>
    {#if showNewUserGuide}
      <ChevronUp size={16} class="transition-transform duration-300 text-slate-400" />
    {:else}
      <ChevronDown size={16} class="transition-transform duration-300 text-slate-400" />
    {/if}
  </button>
  {#if showNewUserGuide}
    <div class="px-4 pb-4">
      <div class="space-y-3 text-sm text-slate-400 text-left">
        <p>Follow these steps to get started:</p>
        <ol class="list-decimal list-outside ml-5 space-y-3">
          <li>
            <a
              href={GITHUB_SIGNUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              Create a GitHub account
              <ExternalLink size={12} />
            </a>
          </li>
          <li>
            <span>Choose authentication method:</span>
          </li>
        </ol>
        <div class="space-y-3">
          <!-- GitHub App - Recommended Option -->
          <div class="mt-2 p-3 bg-green-900/20 border border-green-700 rounded-md">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <Sparkles size={16} class="text-green-400" />
                  <span class="text-green-200 font-medium">GitHub App Authentication</span>
                  <span class="px-2 py-0.5 text-xs bg-green-900 text-green-200 rounded"
                    >Recommended</span
                  >
                </div>
                <div class="space-y-1 text-xs text-green-300 mb-3">
                  <div class="flex items-start gap-2">
                    <Shield size={12} class="mt-0.5 flex-shrink-0" />
                    <span>Enhanced security with fine-grained permissions</span>
                  </div>
                  <div class="flex items-start gap-2">
                    <RefreshCw size={12} class="mt-0.5 flex-shrink-0" />
                    <span>Automatic token refresh - no expiration issues</span>
                  </div>
                  <div class="flex items-start gap-2">
                    <Settings size={12} class="mt-0.5 flex-shrink-0" />
                    <span>Easy one-click setup process</span>
                  </div>
                </div>
              </div>
            </div>
            <Button
              on:click={handleGitHubAppConnect}
              class="w-full bg-green-600 hover:bg-green-700 text-white text-sm py-2"
            >
              Connect with GitHub
              <ExternalLink size={14} class="ml-2" />
            </Button>
          </div>

          <!-- Divider -->
          <div class="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <div class="flex-1 h-px bg-slate-700"></div>
            <span>or use advanced option</span>
            <div class="flex-1 h-px bg-slate-700"></div>
          </div>

          <!-- Personal Access Token - Advanced Option -->
          <div class="mt-3 p-3 bg-slate-800/50 border border-slate-700 rounded-md">
            <div class="flex items-center gap-2 mb-2">
              <Lock size={16} class="text-slate-400" />
              <span class="text-slate-300 font-medium">Personal Access Token</span>
              <span class="px-2 py-0.5 text-xs bg-slate-700 text-slate-400 rounded">Advanced</span>
            </div>
            <p class="text-xs text-slate-500 mb-3">
              Manual token management for users who prefer direct API access
            </p>
            <div class="space-y-3">
              <div class="flex items-start gap-2">
                <Shield size={14} class="text-slate-400 mt-0.5 flex-shrink-0" />
                <div class="flex-1">
                  <a
                    href={CREATE_TOKEN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-400 hover:underline inline-flex items-center gap-1 text-sm"
                  >
                    Classic Token
                    <ExternalLink size={12} />
                  </a>
                  <p class="text-xs text-slate-500 mt-0.5">
                    Quick setup with pre-configured permissions for all repository operations.
                  </p>
                </div>
              </div>
              <div class="flex items-start gap-2">
                <Lock size={14} class="text-slate-400 mt-0.5 flex-shrink-0" />
                <div class="flex-1">
                  <a
                    href={CREATE_FINE_GRAINED_TOKEN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-400 hover:underline inline-flex items-center gap-1 text-sm"
                  >
                    Fine-Grained Token
                    <ExternalLink size={12} />
                  </a>
                  <p class="text-xs text-slate-500 mt-0.5">
                    Advanced option with customizable repository-specific permissions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2 mt-4 pt-3 border-t border-slate-700">
        <a
          href={TUTORIAL_LINK}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300"
        >
          <Youtube size={16} />
          Watch Setup Tutorial
        </a>
        <a
          href="https://github.com"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300"
        >
          <Github size={16} />
          Visit GitHub
        </a>
      </div>
    </div>
  {/if}
</div>
