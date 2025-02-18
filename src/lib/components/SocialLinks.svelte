<script lang="ts">
  import { Coffee, GitlabIcon, YoutubeIcon } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/button';

  export let GITLAB_LINK: string;
  export let YOUTUBE_LINK: string;
  export let COFFEE_LINK: string;

  function openLink(url: string) {
    chrome.tabs.create({ url });
  }
</script>

<div class="flex justify-center space-x-4">
  <Button
    variant="outline"
    class="border-slate-800 hover:bg-slate-800 text-slate-200"
    on:click={() => openLink(GITLAB_LINK)}
  >
    <GitlabIcon class="w-4 h-4" />
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
