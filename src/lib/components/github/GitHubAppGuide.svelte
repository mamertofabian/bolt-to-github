<!--
  GitHub App Connection Guide Component
  Provides step-by-step instructions for connecting with GitHub App
-->
<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { ChevronDown, ChevronUp, ExternalLink, Check, Shield, RefreshCw, Settings } from 'lucide-svelte';
  import { ChromeStorageService } from '$lib/services/chromeStorage';
  
  export let onConnect: (() => void) | null = null;
  export let showByDefault: boolean = false;

  let isExpanded = showByDefault;
  let isConnecting = false;

  function toggleExpanded() {
    isExpanded = !isExpanded;
  }

  async function handleConnect() {
    isConnecting = true;
    
    try {
      if (onConnect) {
        onConnect();
      }
    } catch (error) {
      console.error('Failed to connect:', error);
    } finally {
      isConnecting = false;
    }
  }
</script>

<div class="border border-slate-700 rounded-lg bg-slate-900/50 overflow-hidden mb-4">
  <!-- Header -->
  <div
    class="flex items-center justify-between p-4 bg-slate-800/50 border-b border-slate-700 cursor-pointer hover:bg-slate-800/70 transition-colors"
    on:click={toggleExpanded}
    on:keydown={(e) => e.key === 'Enter' && toggleExpanded()}
    role="button"
    tabindex="0"
  >
    <div class="flex items-center gap-3">
      <Shield class="w-5 h-5 text-blue-400" />
      <div>
        <h3 class="text-lg font-semibold text-slate-200">GitHub App Connection Guide</h3>
        <p class="text-sm text-slate-400">
          Secure authentication with automatic token refresh
        </p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <span class="px-2 py-1 text-xs bg-green-900 text-green-200 rounded">Recommended</span>
      {#if isExpanded}
        <ChevronUp class="w-5 h-5 text-slate-400" />
      {:else}
        <ChevronDown class="w-5 h-5 text-slate-400" />
      {/if}
    </div>
  </div>

  <!-- Content -->
  {#if isExpanded}
    <div class="p-4 space-y-4" style="animation: slideDown 0.2s ease-out;">
      <!-- Benefits Section -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="flex items-start gap-3 p-3 bg-green-900/20 border border-green-700 rounded-md">
          <Shield class="w-5 h-5 text-green-400 mt-0.5" />
          <div>
            <h4 class="text-green-200 font-medium text-sm">Enhanced Security</h4>
            <p class="text-green-300 text-xs mt-1">
              Fine-grained permissions and secure token management
            </p>
          </div>
        </div>
        
        <div class="flex items-start gap-3 p-3 bg-blue-900/20 border border-blue-700 rounded-md">
          <RefreshCw class="w-5 h-5 text-blue-400 mt-0.5" />
          <div>
            <h4 class="text-blue-200 font-medium text-sm">Auto Token Refresh</h4>
            <p class="text-blue-300 text-xs mt-1">
              No more manual token regeneration or expiration issues
            </p>
          </div>
        </div>
        
        <div class="flex items-start gap-3 p-3 bg-purple-900/20 border border-purple-700 rounded-md">
          <Settings class="w-5 h-5 text-purple-400 mt-0.5" />
          <div>
            <h4 class="text-purple-200 font-medium text-sm">Easy Setup</h4>
            <p class="text-purple-300 text-xs mt-1">
              One-click connection with automatic configuration
            </p>
          </div>
        </div>
      </div>

      <!-- Step-by-step Guide -->
      <div class="space-y-4">
        <h4 class="text-slate-200 font-medium">How to Connect:</h4>
        
        <div class="space-y-3">
          <div class="flex items-start gap-3">
            <div class="w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">
              1
            </div>
            <div>
              <p class="text-slate-200 text-sm font-medium">Click "Connect with GitHub"</p>
              <p class="text-slate-400 text-xs mt-1">
                This will open bolt2github.com in a new tab for secure authentication
              </p>
            </div>
          </div>
          
          <div class="flex items-start gap-3">
            <div class="w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">
              2
            </div>
            <div>
              <p class="text-slate-200 text-sm font-medium">Authorize the GitHub App</p>
              <p class="text-slate-400 text-xs mt-1">
                Review and approve the requested permissions on GitHub
              </p>
            </div>
          </div>
          
          <div class="flex items-start gap-3">
            <div class="w-6 h-6 bg-blue-600 text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">
              3
            </div>
            <div>
              <p class="text-slate-200 text-sm font-medium">Return to the extension</p>
              <p class="text-slate-400 text-xs mt-1">
                Your extension will automatically detect the connection and update settings
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Connection Button -->
      <div class="pt-4 border-t border-slate-700">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-slate-200 text-sm font-medium">Ready to get started?</p>
            <p class="text-slate-400 text-xs">
              This will redirect you to bolt2github.com for secure authentication
            </p>
          </div>
          
          <Button
            class="bg-blue-600 hover:bg-blue-700 text-white"
            on:click={handleConnect}
            disabled={isConnecting}
          >
            {#if isConnecting}
              <RefreshCw class="w-4 h-4 mr-2 animate-spin" />
              Connecting...
            {:else}
              Connect with GitHub
              <ExternalLink class="w-4 h-4 ml-2" />
            {/if}
          </Button>
        </div>
      </div>

      <!-- FAQ Section -->
      <div class="pt-4 border-t border-slate-700">
        <details class="group">
          <summary class="text-slate-200 text-sm font-medium cursor-pointer hover:text-slate-100">
            Frequently Asked Questions
          </summary>
          <div class="mt-3 space-y-3 text-xs text-slate-400">
            <div>
              <p class="font-medium text-slate-300">What permissions does the GitHub App need?</p>
              <p>The app requests minimal permissions: repository contents (read/write) and metadata (read) for the repositories you choose to install it on.</p>
            </div>
            <div>
              <p class="font-medium text-slate-300">Can I still use my Personal Access Token?</p>
              <p>Yes! You can switch between GitHub App and Personal Access Token authentication anytime in the settings.</p>
            </div>
            <div>
              <p class="font-medium text-slate-300">Is my data secure?</p>
              <p>Absolutely. The GitHub App uses OAuth 2.0 for secure authentication, and tokens are encrypted and stored securely.</p>
            </div>
          </div>
        </details>
      </div>
    </div>
  {/if}
</div>

<style>
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>