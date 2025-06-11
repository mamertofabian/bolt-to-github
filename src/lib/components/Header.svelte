<script lang="ts">
  import { Home, Settings, FolderGit2, HelpCircle } from 'lucide-svelte';
  import { TabsList, TabsTrigger } from '$lib/components/ui/tabs';
</script>

<TabsList class="grid w-full grid-cols-4">
  <TabsTrigger value="home" class="gap-2">
    <Home class="h-4 w-4" />
    Home
  </TabsTrigger>
  <TabsTrigger value="projects" class="gap-2">
    <FolderGit2 class="h-4 w-4" />
    Projects
  </TabsTrigger>
  <TabsTrigger value="settings" class="gap-2">
    <Settings class="h-4 w-4" />
    Settings
  </TabsTrigger>
  <TabsTrigger value="help" class="gap-2">
    <HelpCircle class="h-4 w-4" />
    Help
  </TabsTrigger>
</TabsList>
