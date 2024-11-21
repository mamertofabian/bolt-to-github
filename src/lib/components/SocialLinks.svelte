<script lang="ts">
    import { Coffee, GithubIcon, YoutubeIcon } from "lucide-svelte";
    import { Button } from "$lib/components/ui/button";
  
    export let GITHUB_LINK: string;
    export let YOUTUBE_LINK: string;
    export let COFFEE_LINK: string;
  
    function openLink(url: string) {
      chrome.tabs.create({ url });
    }
  </script>
  
  <div class="flex justify-center space-x-4">
    <Button
      variant="outline"
      class="flex items-center gap-2"
      on:click={() => openLink(GITHUB_LINK)}
    >
      <GithubIcon class="w-4 h-4" />
    </Button>
    <Button
      variant="outline"
      class="flex items-center gap-2"
      on:click={() => openLink(YOUTUBE_LINK)}
    >
      <YoutubeIcon class="w-4 h-4" />
    </Button>
    <Button
      variant="outline"
      class="flex items-center gap-2"
      on:click={() => openLink(COFFEE_LINK)}
    >
      <Coffee class="w-4 h-4" />
      Buy me a coffee
    </Button>
  </div>
  