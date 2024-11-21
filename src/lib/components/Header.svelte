<script lang="ts">
    import { Home, Settings } from "lucide-svelte";
    import { TabsList, TabsTrigger } from "$lib/components/ui/tabs";
  </script>
  
  <TabsList class="grid w-full grid-cols-2">
    <TabsTrigger value="home" class="flex items-center gap-2">
      <Home class="w-4 h-4" />
      Home
    </TabsTrigger>
    <TabsTrigger value="settings" class="flex items-center gap-2">
      <Settings class="w-4 h-4" />
      Settings
    </TabsTrigger>
  </TabsList>
