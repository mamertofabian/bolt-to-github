<script lang="ts">
  export let show = false;
  export let title: string;
</script>

{#if show}
  <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
    <div class="bg-slate-900 p-6 rounded-lg shadow-xl max-w-md w-full mx-4 border border-slate-800">
      <h2 class="text-xl font-semibold mb-4">{title}</h2>
      <div class="space-y-4">
        <slot />
      </div>
    </div>
  </div>
{/if}
