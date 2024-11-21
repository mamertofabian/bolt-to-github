<script lang="ts">
  import { Card, CardContent } from "$lib/components/ui/card";
  
  export let uploadStatus: string;
  export let uploadProgress: number;
  export let uploadMessage: string;
</script>

{#if uploadStatus !== "idle"}
  <Card class="mt-4 border-slate-800 bg-slate-900">
    <CardContent class="pt-6">
      <div class="flex items-center justify-between mb-2">
        <span class="font-medium text-slate-200">
          {#if uploadStatus === "uploading"}
            Uploading to GitHub...
          {:else if uploadStatus === "success"}
            Upload Complete!
          {:else if uploadStatus === "error"}
            Upload Failed
          {/if}
        </span>
        {#if uploadStatus === "uploading"}
          <span class="text-sm text-slate-400">{uploadProgress}%</span>
        {/if}
      </div>

      {#if uploadStatus === "uploading"}
        <div class="w-full bg-slate-800 rounded-full h-2.5">
          <div
            class="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
            style="width: {uploadProgress}%"
          />
        </div>
      {/if}

      {#if uploadMessage}
        <p
          class="mt-2 text-sm"
          class:text-red-400={uploadStatus === "error"}
          class:text-green-400={uploadStatus === "success"}
        >
          {uploadMessage}
        </p>
      {/if}
    </CardContent>
  </Card>
{/if}
