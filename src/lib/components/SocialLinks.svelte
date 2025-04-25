<script lang="ts">
  import { Coffee, GithubIcon, YoutubeIcon, HelpCircle } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';

  export let GITHUB_LINK: string;
  export let YOUTUBE_LINK: string;
  export let COFFEE_LINK: string;
  export let HELP_LINK: string = 'https://fix.aidrivencoder.com';

  function openLink(url: string) {
    chrome.tabs.create({ url });
  }
</script>

<div class="flex justify-center space-x-4">
  <Button
    variant="outline"
    class="border-slate-800 hover:bg-slate-800 text-slate-200"
    on:click={() => openLink(GITHUB_LINK)}
  >
    <GithubIcon class="w-4 h-4" />
  </Button>
  <Button
    variant="outline"
    class="border-slate-800 hover:bg-slate-800 text-slate-200"
    on:click={() => openLink(YOUTUBE_LINK)}
  >
    <YoutubeIcon class="w-4 h-4" />
  </Button>
  <Button
    variant="outline"
    class="border-yellow-600/50 hover:bg-yellow-600/10 text-yellow-600 flex items-center gap-2"
    on:click={() => openLink(COFFEE_LINK)}
  >
    <Coffee class="w-4 h-4" />
    <span class="whitespace-nowrap">Buy me a coffee</span>
  </Button>
</div>

<div class="mt-3 flex justify-center">
  <Button
    variant="outline"
    class="border-blue-600/50 hover:bg-blue-600/10 text-blue-400 flex items-center gap-2 w-full"
    on:click={() => openLink(HELP_LINK)}
  >
    <HelpCircle class="w-4 h-4" />
    <span class="whitespace-nowrap">Stuck? Get Expert Help →</span>
  </Button>
</div>
