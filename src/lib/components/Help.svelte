<script lang="ts">
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '$lib/components/ui/card';
  import { CREATE_TOKEN_URL } from '../../services/GitLabService';
  import { ChevronDown } from 'lucide-svelte';

  let openSections = {
    gettingStarted: false,
    tokenGuide: false,
    privateRepo: false,
    security: false,
  };

  type SectionKey = keyof typeof openSections;

  function toggleSection(section: SectionKey) {
    openSections[section] = !openSections[section];
  }
</script>

<Card class="border-slate-800 bg-slate-900">
  <CardHeader>
    <CardTitle class="text-xl">✨ Help & Documentation</CardTitle>
    <CardDescription class="text-slate-400">
      Learn how to use Bolt to GitLab effectively
    </CardDescription>
  </CardHeader>
  <CardContent class="space-y-4">
    <!-- Getting Started Section -->
    <div class="border border-slate-800 rounded-lg overflow-hidden">
      <button
        class="w-full p-4 flex items-center justify-between bg-slate-800/50 hover:bg-slate-800/70 transition-colors"
        on:click={() => toggleSection('gettingStarted')}
      >
        <h3 class="text-base font-semibold text-slate-200 text-left">🚀 Getting Started</h3>
        <ChevronDown
          size={20}
          class={`text-slate-400 transition-transform duration-200 ${openSections.gettingStarted ? 'rotate-180' : ''}`}
        />
      </button>
      {#if openSections.gettingStarted}
        <div class="p-4 space-y-2">
          <p class="text-sm text-slate-400">1. Click the extension icon in your browser toolbar</p>
          <p class="text-sm text-slate-400">
            2. Follow the popup instructions to set up your GitLab access
          </p>
          <p class="text-sm text-slate-400">
            3. Once configured, you can use Bolt to GitLab from any bolt.new page
          </p>
        </div>
      {/if}
    </div>

    <!-- GitHub Token Guide Section -->
    <div class="border border-slate-800 rounded-lg overflow-hidden">
      <button
        class="w-full p-4 flex items-center justify-between bg-slate-800/50 hover:bg-slate-800/70 transition-colors"
        on:click={() => toggleSection('tokenGuide')}
      >
        <h3 class="text-base font-semibold text-slate-200 text-left">🔑 GitLab Token Guide</h3>
        <ChevronDown
          size={20}
          class={`text-slate-400 transition-transform duration-200 ${openSections.tokenGuide ? 'rotate-180' : ''}`}
        />
      </button>
      {#if openSections.tokenGuide}
        <div class="p-4 space-y-3">
          <div class="rounded-md bg-slate-800 p-4">
            <h4 class="mb-2 font-medium text-slate-200">🎯 Personal Access Token</h4>
            <p class="mb-2 text-sm text-slate-400">
              Quick to set up, works with both public and private repositories:
            </p>
            <ol class="ml-4 list-decimal text-sm text-slate-400">
              <li>
                Visit the <a
                  href={CREATE_TOKEN_URL}
                  target="_blank"
                  class="text-blue-400 hover:underline">token creation page</a
                >
              </li>
              <li>The required scopes (api, read_api, read_repository, write_repository) are pre-configured in the link</li>
              <li>Click "Create token" at the bottom and copy the token</li>
              <li>Paste the token into the "GitLab Token" field in the "Settings" tab</li>
            </ol>
          </div>
        </div>
      {/if}
    </div>

    <!-- Private Repository Import Section -->
    <div class="border border-slate-800 rounded-lg overflow-hidden">
      <button
        class="w-full p-4 flex items-center justify-between bg-slate-800/50 hover:bg-slate-800/70 transition-colors"
        on:click={() => toggleSection('privateRepo')}
      >
        <h3 class="text-base font-semibold text-slate-200 text-left">
          🔒 Private Repository Import
        </h3>
        <ChevronDown
          size={20}
          class={`text-slate-400 transition-transform duration-200 ${openSections.privateRepo ? 'rotate-180' : ''}`}
        />
      </button>
      {#if openSections.privateRepo}
        <div class="p-4">
          <div class="rounded-md bg-slate-800/50 p-3 text-sm text-slate-400">
            <p>When importing private repositories:</p>
            <ol class="ml-4 mt-2 list-decimal">
              <li>A temporary public clone is created</li>
              <li>Bolt starts importing from this clone</li>
              <li>The temporary repository is automatically deleted after 1 minute</li>
            </ol>
            <div class="mt-3 p-2 bg-amber-900/30 rounded border border-amber-700/30">
              <p class="text-amber-400 font-medium">Important:</p>
              <p class="mt-1">
                After importing a private repository, immediately go to the Settings tab and select
                your imported repository. This ensures your Bolt changes sync with the correct
                repository. Skip this step only if you want to create a new repository instead.
              </p>
            </div>
            <p class="mt-2 text-amber-400">
              Note: Either token type will work, as long as it has the correct permissions
            </p>
          </div>
        </div>
      {/if}
    </div>

    <!-- Security & Privacy Section -->
    <div class="border border-slate-800 rounded-lg overflow-hidden">
      <button
        class="w-full p-4 flex items-center justify-between bg-slate-800/50 hover:bg-slate-800/70 transition-colors"
        on:click={() => toggleSection('security')}
      >
        <h3 class="text-base font-semibold text-slate-200 text-left">🛡️ Security & Privacy</h3>
        <ChevronDown
          size={20}
          class={`text-slate-400 transition-transform duration-200 ${openSections.security ? 'rotate-180' : ''}`}
        />
      </button>
      {#if openSections.security}
        <div class="p-4">
          <div class="rounded-md bg-slate-800/50 p-3 text-sm text-slate-400">
            <p class="font-medium mb-2">Token Usage & Security:</p>
            <ul class="space-y-2">
              <li>• Your GitLab token is used exclusively for GitLab API operations</li>
              <li>• No third-party servers are connected to this extension</li>
              <li>• Tokens are stored securely in your browser's local storage</li>
              <li>• All operations are performed directly between your browser and GitLab's API</li>
            </ul>
            <div class="mt-3 p-2 bg-amber-900/30 rounded border border-amber-700/30">
              <p class="text-amber-400 font-medium">Security Notice:</p>
              <p class="mt-1">
                Your GitLab token grants access to your repositories. It is your responsibility to:
              </p>
              <ul class="mt-2 ml-4 space-y-1 text-amber-400/90">
                <li>• Keep your token secure and private</li>
                <li>• Never share your token with others</li>
                <li>• Regularly rotate your tokens for enhanced security</li>
                <li>• Revoke tokens immediately if compromised</li>
              </ul>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Need More Help Section (Always visible) -->
    <div class="space-y-2 mt-4 pt-4 border-t border-slate-800">
      <h3 class="text-base font-semibold text-slate-200">💡 Need More Help?</h3>
      <ul class="space-y-2 text-sm text-slate-400">
        <li>
          • Visit our <a
            href="https://gitlab.com/aidrivencoder/bolt-to-gitlab"
            target="_blank"
            class="text-blue-400 hover:underline">GitLab repository</a
          > for detailed documentation, issues, and updates
        </li>
        <li>
          • Join our <a
            href="https://aidrivencoder.com/discord"
            target="_blank"
            class="text-blue-400 hover:underline">Discord community</a
          > for support and discussions
        </li>
        <li>
          • Watch our <a
            href="https://aidrivencoder.com/youtube"
            target="_blank"
            class="text-blue-400 hover:underline">AI development tutorials</a
          > on YouTube for expert guidance and tips! 🎥
        </li>
      </ul>
    </div>
  </CardContent>
</Card>
