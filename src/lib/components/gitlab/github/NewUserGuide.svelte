<script>
  import { TUTORIAL_LINK } from '$lib/constants';
  import {
    AlertCircle,
    ChevronUp,
    ChevronDown,
    ExternalLink,
    Youtube,
    Github,
    Shield,
    Lock,
  } from 'lucide-svelte';
  import {
    GITHUB_SIGNUP_URL,
    CREATE_TOKEN_URL,
    CREATE_FINE_GRAINED_TOKEN_URL,
  } from '../../../services/GitHubService';
  import { onMount } from 'svelte';

  let showNewUserGuide = true;

  function toggleNewUserGuide() {
    showNewUserGuide = !showNewUserGuide;
    chrome.storage.local.set({ showNewUserGuide });
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
    <div class="px-4 pb-4 space-y-2">
      <div class="space-y-2 text-sm text-slate-400">
        <p>Follow these steps to get started:</p>
        <ol class="list-decimal list-inside space-y-3 ml-2">
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
          <li class="space-y-2">
            Choose a GitHub token type:
            <div class="ml-4 space-y-2">
              <div>
                <a
                  href={CREATE_TOKEN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  <Shield size={14} />
                  Classic Token
                  <ExternalLink size={12} />
                </a>
                <p class="text-xs text-slate-500 ml-5">
                  Quick setup with pre-configured permissions for all repository operations.
                </p>
              </div>
              <div>
                <a
                  href={CREATE_FINE_GRAINED_TOKEN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-blue-400 hover:underline inline-flex items-center gap-1"
                >
                  <Lock size={14} />
                  Fine-Grained Token
                  <ExternalLink size={12} />
                </a>
                <p class="text-xs text-slate-500 ml-5">
                  Advanced option with customizable repository-specific permissions.
                </p>
              </div>
            </div>
          </li>
        </ol>
      </div>
      <div class="flex items-center gap-2 mt-2 pt-2 border-t border-slate-700">
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
