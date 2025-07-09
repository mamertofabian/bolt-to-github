# Window Mode Tab Selector Design

## Problem Statement

The popup window mode loses contextual relationship with specific Bolt.new tabs, breaking core functionality that relies on knowing which project the user is working with.

## Solution: Tab Selector Component

### 1. Tab Detection Service

```typescript
// src/lib/services/TabDetectionService.ts
export class TabDetectionService {
  static async getBoltTabs(): Promise<BoltTab[]> {
    const tabs = await chrome.tabs.query({ url: 'https://bolt.new/~/\*' });
    return tabs
      .filter((tab) => tab.url && tab.id)
      .map((tab) => ({
        id: tab.id!,
        title: tab.title || 'Untitled Project',
        url: tab.url!,
        projectId: extractProjectIdFromUrl(tab.url!),
        isActive: tab.active,
      }))
      .filter((tab) => tab.projectId);
  }

  static async getActiveTab(): Promise<BoltTab | null> {
    const tabs = await this.getBoltTabs();
    return tabs.find((tab) => tab.isActive) || tabs[0] || null;
  }
}
```

### 2. Tab Selector Component

```svelte
<!-- src/lib/components/TabSelector.svelte -->
<script lang="ts">
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '$lib/components/ui/select';
  import { onMount } from 'svelte';
  import { TabDetectionService } from '$lib/services/TabDetectionService';

  export let selectedTabId: number | null = null;
  export let onTabChange: (tabId: number, projectId: string) => void;

  let boltTabs: BoltTab[] = [];
  let isLoading = true;

  onMount(async () => {
    await loadTabs();
    // Auto-select first tab if none selected
    if (!selectedTabId && boltTabs.length > 0) {
      selectTab(boltTabs[0]);
    }
  });

  async function loadTabs() {
    try {
      boltTabs = await TabDetectionService.getBoltTabs();
    } catch (error) {
      console.error('Failed to load tabs:', error);
      boltTabs = [];
    } finally {
      isLoading = false;
    }
  }

  function selectTab(tab: BoltTab) {
    selectedTabId = tab.id;
    onTabChange(tab.id, tab.projectId);
  }

  function formatTabTitle(tab: BoltTab): string {
    return tab.projectId.length > 20 ? `${tab.projectId.substring(0, 20)}...` : tab.projectId;
  }
</script>

{#if isLoading}
  <div class="flex items-center gap-2 p-2 text-sm text-muted-foreground">
    <div
      class="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
    ></div>
    Loading tabs...
  </div>
{:else if boltTabs.length === 0}
  <div class="p-2 text-sm text-muted-foreground">No Bolt.new tabs found</div>
{:else if boltTabs.length === 1}
  <div class="p-2 text-sm">
    <span class="text-muted-foreground">Project:</span>
    <span class="font-medium">{formatTabTitle(boltTabs[0])}</span>
  </div>
{:else}
  <Select
    value={selectedTabId?.toString()}
    onValueChange={(value) => {
      const tabId = parseInt(value);
      const tab = boltTabs.find((t) => t.id === tabId);
      if (tab) selectTab(tab);
    }}
  >
    <SelectTrigger class="w-full">
      <SelectValue placeholder="Select a project tab" />
    </SelectTrigger>
    <SelectContent>
      {#each boltTabs as tab}
        <SelectItem value={tab.id.toString()}>
          <div class="flex items-center gap-2">
            <div class="h-2 w-2 rounded-full bg-green-500"></div>
            {formatTabTitle(tab)}
          </div>
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>
{/if}
```

### 3. Window Mode Detection & Integration

```typescript
// Update src/lib/utils/windowMode.ts
export function isWindowMode(): boolean {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('mode') === 'window';
}

export class WindowModeStateSync {
  private static SELECTED_TAB_KEY = 'windowMode_selectedTab';

  static async getSelectedTab(): Promise<number | null> {
    const result = await chrome.storage.local.get(this.SELECTED_TAB_KEY);
    return result[this.SELECTED_TAB_KEY] || null;
  }

  static async setSelectedTab(tabId: number): Promise<void> {
    await chrome.storage.local.set({ [this.SELECTED_TAB_KEY]: tabId });
  }
}
```

### 4. App.svelte Integration

```svelte
<!-- Update src/popup/App.svelte -->
<script lang="ts">
  import TabSelector from '$lib/components/TabSelector.svelte';
  import { isWindowMode, WindowModeStateSync } from '$lib/utils/windowMode';

  // Add new state
  let isInWindowMode = false;
  let selectedTabId: number | null = null;
  let windowModeProjectId: string | null = null;

  // Update initialization
  async function initializeApp() {
    // ... existing code ...

    isInWindowMode = isWindowMode();

    if (isInWindowMode) {
      // Restore selected tab from storage
      selectedTabId = await WindowModeStateSync.getSelectedTab();

      // Override project detection for window mode
      if (selectedTabId) {
        const tabs = await TabDetectionService.getBoltTabs();
        const selectedTab = tabs.find(t => t.id === selectedTabId);
        if (selectedTab) {
          windowModeProjectId = selectedTab.projectId;
          // Update stores with window mode project
          await projectSettingsActions.setCurrentProject(windowModeProjectId);
        }
      }
    } else {
      // Normal popup mode - detect current project
      await projectSettingsActions.detectCurrentProject();
    }

    // ... rest of existing code ...
  }

  // Handle tab selection in window mode
  async function handleTabChange(tabId: number, projectId: string) {
    selectedTabId = tabId;
    windowModeProjectId = projectId;

    // Save selection
    await WindowModeStateSync.setSelectedTab(tabId);

    // Update project context
    await projectSettingsActions.setCurrentProject(projectId);
    githubSettingsActions.loadProjectSettings(projectId);

    // Refresh project status
    if (projectStatusRef) {
      await projectStatusRef.getProjectStatus();
    }
  }

  // Override projectId for window mode
  $: effectiveProjectId = isInWindowMode ? windowModeProjectId : projectId;
</script>

<Card class="w-full max-w-md mx-auto">
  <CardHeader class="pb-3">
    <div class="flex items-center justify-between">
      <div>
        <CardTitle class="text-lg">Bolt to GitHub</CardTitle>
        <CardDescription class="text-slate-400">
          Upload and sync your Bolt projects to GitHub
        </CardDescription>
      </div>
      {#if !isInWindowMode}
        <Button variant="ghost" size="sm" on:click={openPopupWindow}>
          <ExternalLink class="h-4 w-4" />
        </Button>
      {/if}
    </div>

    <!-- Tab Selector for Window Mode -->
    {#if isInWindowMode}
      <div class="mt-3 border-t pt-3">
        <TabSelector
          bind:selectedTabId
          onTabChange={handleTabChange}
        />
      </div>
    {/if}
  </CardHeader>

  <CardContent>
    {#if displayMode === DISPLAY_MODES.TABS}
      <TabsView
        {uiState}
        {githubSettings}
        {projectSettings}
        projectId={effectiveProjectId}
        <!-- ... rest of props ... -->
      />
    {:else}
      <!-- ... onboarding view ... -->
    {/if}
  </CardContent>
</Card>
```

### 5. Background Service Updates

```typescript
// Update src/background/BackgroundService.ts
export class BackgroundService {
  // Add method to get bolt tabs for window mode
  private async handleGetBoltTabs(
    sendResponse: (response: { tabs: BoltTab[] }) => void
  ): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://bolt.new/~/\*' });
      const boltTabs = tabs
        .filter((tab) => tab.url && tab.id)
        .map((tab) => ({
          id: tab.id!,
          title: tab.title || 'Untitled Project',
          url: tab.url!,
          projectId: extractProjectIdFromUrl(tab.url!),
          isActive: tab.active,
        }))
        .filter((tab) => tab.projectId);

      sendResponse({ tabs: boltTabs });
    } catch (error) {
      logger.error('❌ Failed to get bolt tabs:', error);
      sendResponse({ tabs: [] });
    }
  }

  // Add to runtime message handler
  private setupConnectionHandlers(): void {
    chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
      // ... existing handlers ...

      if (message.type === 'GET_BOLT_TABS') {
        this.handleGetBoltTabs(sendResponse);
        return true;
      }

      // ... rest of handlers ...
    });
  }
}
```

## Benefits

1. **✅ Maintains Context**: Users can clearly see and select which project they're working with
2. **✅ Familiar UX**: Similar to browser tab switching or IDE project selection
3. **✅ Backward Compatible**: Doesn't affect normal popup mode
4. **✅ Scalable**: Works with any number of open tabs
5. **✅ Persistent**: Remembers last selected tab across window sessions

## Edge Cases Handled

1. **No Bolt Tabs**: Shows appropriate message
2. **Single Tab**: Shows project name without dropdown
3. **Tab Closed**: Auto-selects next available tab
4. **Tab Navigation**: Updates project context when URLs change
5. **Storage Persistence**: Remembers selection across window closes

## Next Steps

1. Implement `TabDetectionService`
2. Create `TabSelector` component
3. Update `App.svelte` with window mode logic
4. Add background service handlers
5. Test with multiple projects
6. Add tab refresh functionality
