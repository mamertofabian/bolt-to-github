<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import Modal from '$lib/components/ui/modal/Modal.svelte';
  import type { NativeSyncHandoffController } from '$lib/native-sync/NativeSyncHandoffController';
  import type {
    NativeSyncHandoffView,
    NativeSyncBlockedReason,
  } from '$lib/native-sync/nativeSyncHandoffView';

  export let show = false;
  export let controller: NativeSyncHandoffController;
  export let onClose: () => void;

  // The component is self-driving: it renders solely from controller.getView()
  // and changes state only by calling controller methods, then re-reading the view.
  let view: NativeSyncHandoffView = controller.getView();
  let attested = false;
  let searchQuery = '';
  let loaded = false;

  function refresh() {
    view = controller.getView();
  }

  async function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    await controller.load();
    refresh();
  }

  // Load the handoff once when the surface opens; never on every render.
  $: if (show && !loaded) {
    void ensureLoaded();
  }

  $: identities = view.identities;
  $: discovery = view.discovery;
  $: selection = view.selection;
  $: completion = view.completion;

  async function handleDiscover() {
    await controller.discover();
    refresh();
  }

  async function handleSearch() {
    await controller.search(searchQuery);
    refresh();
  }

  function handleSelect(repo: string) {
    // A fresh selection always requires a fresh attestation.
    attested = false;
    // The adopted branch is the user's actual imported branch, read from the view.
    controller.select(repo, identities?.branch ?? '');
    refresh();
  }

  function handleBack() {
    attested = false;
    controller.back();
    refresh();
  }

  async function handleAdopt() {
    await controller.attestAndAdopt(attested);
    refresh();
  }

  async function handleRetry() {
    await controller.retry();
    refresh();
  }

  function handleResume() {
    controller.resume();
    refresh();
  }

  function handleDismiss() {
    controller.dismiss();
    onClose();
  }

  function handleModalClose() {
    onClose();
  }

  function blockedMessage(reason: NativeSyncBlockedReason | null): string {
    switch (reason) {
      case 'discovery_failed':
        return 'We could not reach GitHub to list your repositories. Check your connection and retry.';
      case 'inaccessible':
        return 'The selected repository or branch is not accessible. Go back and choose another.';
      case 'not_attested':
        return 'Native setup was not confirmed. Go back and confirm the repository and branch.';
      case 'journey_blocked':
        return 'Another native-sync journey is already active for this project. Retry once it finishes.';
      case 'no_handoff':
        return 'This project no longer has a pending handoff. Retry to reload its state.';
      default:
        return 'Something went wrong. Please retry.';
    }
  }
</script>

<Modal {show} title="Native repository handoff" maxWidth="max-w-lg" on:close={handleModalClose}>
  <div class="space-y-4 text-sm text-slate-200">
    {#if view.phase === 'guidance'}
      <div class="space-y-3">
        <h3 class="text-base font-semibold text-white">Enable native GitHub sync inside Bolt</h3>
        <p class="text-slate-300">
          In Bolt, open your project's GitHub settings and enable the native GitHub integration.
          Bolt to GitHub will then help you adopt the repository that Bolt creates on GitHub.
        </p>
        {#if identities}
          <div class="space-y-1 rounded border border-slate-700 bg-slate-800/50 p-2">
            <p class="text-slate-300">
              Original repository <span class="font-semibold text-white"
                >{identities.originalRepo}</span
              > is preserved.
            </p>
            <p class="text-slate-300">
              The temporary public clone <span class="font-semibold text-white"
                >{identities.tempRepo}</span
              > was deleted.
            </p>
          </div>
        {/if}
        <div class="flex justify-between gap-2 pt-2">
          <Button variant="ghost" class="text-xs" on:click={handleDismiss}>Dismiss</Button>
          <Button variant="default" class="text-xs" on:click={handleDiscover}>
            Find repositories
          </Button>
        </div>
      </div>
    {:else if view.phase === 'discovery'}
      <div class="space-y-3">
        <h3 class="text-base font-semibold text-white">Choose the Bolt-created repository</h3>
        {#if discovery && discovery.status !== 'none'}
          <p class="text-slate-300">Select the repository Bolt created for this project:</p>
          <div class="space-y-2">
            {#each discovery.candidates as candidate (candidate.name)}
              <button
                type="button"
                class="w-full rounded border border-slate-700 bg-slate-800/50 p-2 text-left hover:bg-slate-800"
                on:click={() => handleSelect(candidate.name)}
              >
                <span class="font-medium text-white">{candidate.name}</span>
                {#if candidate.createdBeforeHandoff}
                  <span class="ml-2 text-xs text-amber-400">created before handoff</span>
                {/if}
              </button>
            {/each}
          </div>
          <div class="flex justify-between gap-2 pt-2">
            <Button variant="ghost" class="text-xs" on:click={handleDismiss}>Dismiss</Button>
            <Button variant="outline" class="text-xs" on:click={handleDiscover}>Refresh</Button>
          </div>
        {:else}
          <p class="text-slate-300">No repositories found yet.</p>
          <p class="text-xs text-slate-400">
            Enable Bolt's native GitHub integration in Bolt, then refresh. You can also search by
            name.
          </p>
          <div class="flex gap-2">
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Search repositories by name"
              aria-label="Search repositories by name"
              class="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-white"
            />
            <Button variant="outline" class="text-xs" on:click={handleSearch}>Search</Button>
          </div>
          <div class="flex justify-between gap-2 pt-2">
            <Button variant="ghost" class="text-xs" on:click={handleDismiss}>Dismiss</Button>
            <Button variant="default" class="text-xs" on:click={handleDiscover}>Refresh</Button>
          </div>
        {/if}
      </div>
    {:else if view.phase === 'confirm'}
      <div class="space-y-3">
        <h3 class="text-base font-semibold text-white">Confirm native setup</h3>
        {#if selection}
          <p class="text-slate-300">
            You selected <span class="font-semibold text-white">{selection.repo}</span> on branch
            <span class="font-semibold text-white">{selection.branch}</span>.
          </p>
        {/if}
        <label class="flex items-start gap-2 text-slate-300">
          <input type="checkbox" bind:checked={attested} class="mt-1" />
          <span>
            I confirm I enabled Bolt's native GitHub integration and this is the repository Bolt
            created for this project.
          </span>
        </label>
        <div class="flex items-center justify-between gap-2 pt-2">
          <div class="flex gap-2">
            <Button variant="ghost" class="text-xs" on:click={handleBack}>Back</Button>
            <Button variant="ghost" class="text-xs" on:click={handleDismiss}>Dismiss</Button>
          </div>
          <Button variant="default" class="text-xs" on:click={handleAdopt} disabled={!attested}>
            Adopt
          </Button>
        </div>
      </div>
    {:else if view.phase === 'blocked'}
      <div class="space-y-3">
        <h3 class="text-base font-semibold text-amber-300">We hit a snag</h3>
        <p class="text-slate-300">{blockedMessage(view.blocked)}</p>
        <div class="flex items-center justify-between gap-2 pt-2">
          <Button variant="ghost" class="text-xs" on:click={handleDismiss}>Dismiss</Button>
          <div class="flex gap-2">
            {#if view.actions.includes('back')}
              <Button variant="outline" class="text-xs" on:click={handleBack}>Back</Button>
            {/if}
            {#if view.actions.includes('retry')}
              <Button variant="default" class="text-xs" on:click={handleRetry}>Retry</Button>
            {/if}
          </div>
        </div>
      </div>
    {:else if view.phase === 'completed'}
      <div class="space-y-3">
        <h3 class="text-base font-semibold text-white">Adoption complete</h3>
        {#if completion}
          <p class="text-slate-200">
            This project is now mapped to <span class="font-semibold text-white"
              >{completion.adoptedRepo}</span
            >
            on <span class="font-semibold text-white">{completion.adoptedBranch}</span> — a user-confirmed
            native mapping.
          </p>
          <p class="text-slate-300">
            Incoming changes return through Bolt's native GitHub integration when Bolt has linked
            the repository.
          </p>
          <p class="text-slate-300">Bolt may also create its own commits.</p>
          <p class="text-xs text-slate-400">
            Bolt to GitHub will continue to make only the commits you start from the extension.
          </p>
        {/if}
        <div class="flex justify-end pt-2">
          <Button variant="default" class="text-xs" on:click={handleModalClose}>Done</Button>
        </div>
      </div>
    {:else if view.phase === 'dismissed'}
      <div class="space-y-3">
        <p class="text-slate-300">
          Setup paused. You can resume the native GitHub handoff whenever you are ready.
        </p>
        <div class="flex justify-end pt-2">
          <Button variant="default" class="text-xs" on:click={handleResume}>Resume</Button>
        </div>
      </div>
    {:else}
      <div class="flex justify-center py-6" role="status" aria-label="Loading handoff">
        <div class="h-6 w-6 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
      </div>
    {/if}
  </div>
</Modal>
