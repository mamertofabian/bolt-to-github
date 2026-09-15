<script lang="ts">
  import { ChevronDown, Sparkles } from 'lucide-svelte';

  type HelpSection = 'gettingStarted' | 'githubApp' | 'privateRepositories' | 'security';

  const openSections: Record<HelpSection, boolean> = {
    gettingStarted: false,
    githubApp: false,
    privateRepositories: false,
    security: false,
  };

  function toggleSection(section: HelpSection) {
    openSections[section] = !openSections[section];
  }

  async function showWhatsNew() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_WHATS_NEW_MODAL' });
        window.close();
      }
    } catch (error) {
      console.error("Failed to show What's New modal:", error);
    }
  }
</script>

<div class="space-y-4">
  <div>
    <div class="mb-2 flex items-center justify-between">
      <h2 class="flex items-center gap-2 text-lg font-semibold text-slate-200">
        <span>✨</span>
        <span>Help & Documentation</span>
      </h2>
      <button
        class="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-1.5 text-sm font-medium text-white hover:from-purple-600 hover:to-pink-600"
        on:click={showWhatsNew}
      >
        <Sparkles size={16} />
        What's New
      </button>
    </div>
    <p class="text-sm text-slate-400">Learn how to use Bolt to GitHub effectively</p>
  </div>

  <div class="overflow-hidden rounded-lg border border-slate-800">
    <button
      class="flex w-full items-center justify-between bg-slate-800/50 px-3 py-2 hover:bg-slate-800/70"
      on:click={() => toggleSection('gettingStarted')}
    >
      <h3 class="text-left text-base font-semibold text-slate-200">🚀 Getting Started</h3>
      <ChevronDown
        size={20}
        class={`text-slate-400 transition-transform ${openSections.gettingStarted ? 'rotate-180' : ''}`}
      />
    </button>
    {#if openSections.gettingStarted}
      <ol class="space-y-2 p-3 text-sm text-slate-400">
        <li>1. Open the extension and choose Connect GitHub Account.</li>
        <li>2. Sign in to your Bolt2GitHub account.</li>
        <li>3. Install the GitHub App and select repository access.</li>
        <li>4. Return to the extension and finish setup.</li>
      </ol>
    {/if}
  </div>

  <div class="overflow-hidden rounded-lg border border-slate-800">
    <button
      class="flex w-full items-center justify-between bg-slate-800/50 px-3 py-2 hover:bg-slate-800/70"
      on:click={() => toggleSection('githubApp')}
    >
      <h3 class="text-left text-base font-semibold text-slate-200">🔗 GitHub App Setup</h3>
      <ChevronDown
        size={20}
        class={`text-slate-400 transition-transform ${openSections.githubApp ? 'rotate-180' : ''}`}
      />
    </button>
    {#if openSections.githubApp}
      <div class="space-y-3 p-3 text-sm text-slate-400">
        <p>Sign in to your Bolt2GitHub account from the extension setup screen.</p>
        <p>Install the GitHub App when prompted and review its requested permissions.</p>
        <p>Choose which repositories the extension may read and update.</p>
        <p>
          If the extension says authentication changed, follow the same sign-in and installation
          steps. Existing project mappings remain available.
        </p>
      </div>
    {/if}
  </div>

  <div class="overflow-hidden rounded-lg border border-slate-800">
    <button
      class="flex w-full items-center justify-between bg-slate-800/50 px-3 py-2 hover:bg-slate-800/70"
      on:click={() => toggleSection('privateRepositories')}
    >
      <h3 class="text-left text-base font-semibold text-slate-200">🔒 Private Repository Access</h3>
      <ChevronDown
        size={20}
        class={`text-slate-400 transition-transform ${openSections.privateRepositories ? 'rotate-180' : ''}`}
      />
    </button>
    {#if openSections.privateRepositories}
      <div class="space-y-3 p-3 text-sm text-slate-400">
        <p>
          Repository access granted to the GitHub App determines which private repositories are
          available.
        </p>
        <p>
          To add or remove access, open the GitHub App installation settings on GitHub and update
          the selected repositories.
        </p>
        <p>The extension will show a connection error if the selected repository is not allowed.</p>
      </div>
    {/if}
  </div>

  <div class="overflow-hidden rounded-lg border border-slate-800">
    <button
      class="flex w-full items-center justify-between bg-slate-800/50 px-3 py-2 hover:bg-slate-800/70"
      on:click={() => toggleSection('security')}
    >
      <h3 class="text-left text-base font-semibold text-slate-200">🛡️ Security & Privacy</h3>
      <ChevronDown
        size={20}
        class={`text-slate-400 transition-transform ${openSections.security ? 'rotate-180' : ''}`}
      />
    </button>
    {#if openSections.security}
      <div class="space-y-3 p-3 text-sm text-slate-400">
        <p>
          GitHub operations use short-lived installation credentials issued for the connected
          account and installation.
        </p>
        <p>The extension requests access only to repositories selected during installation.</p>
        <p>Revoke access by uninstalling the GitHub App or changing its repository selection.</p>
      </div>
    {/if}
  </div>

  <div class="space-y-2 border-t border-slate-800 pt-3">
    <h3 class="text-base font-semibold text-slate-200">💡 Need More Help?</h3>
    <ul class="space-y-2 text-sm text-slate-400">
      <li>
        • Visit the <a
          class="text-blue-400 hover:underline"
          href="https://bolt2github.com"
          target="_blank">official website</a
        >.
      </li>
      <li>
        • Report an issue in the <a
          class="text-blue-400 hover:underline"
          href="https://github.com/mamertofabian/bolt-to-github"
          target="_blank">GitHub repository</a
        >.
      </li>
    </ul>
  </div>
</div>
