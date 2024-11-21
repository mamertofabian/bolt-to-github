<script lang="ts">
  import { AlertTriangle } from "lucide-svelte";
  import { Alert, AlertDescription, AlertTitle } from "$lib/components/ui/alert";

  export let isSettingsValid: boolean;
</script>

{#if !isSettingsValid}
  <Alert variant="destructive" class="mb-4 border-red-900 bg-red-850">
    <AlertTriangle class="h-4 w-4" />
    <AlertTitle>Missing Configuration</AlertTitle>
    <AlertDescription class="text-slate-300">
      Please configure your GitHub settings before using the extension.
    </AlertDescription>
  </Alert>
{:else}
  <Alert class="border-green-900 bg-green-950">
    <AlertTitle>Ready to Use</AlertTitle>
    <AlertDescription class="text-slate-300">
      Your GitHub configuration is set up and ready to go!
    </AlertDescription>
  </Alert>
{/if}
