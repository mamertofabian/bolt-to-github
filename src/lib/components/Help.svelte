<script lang="ts">
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "$lib/components/ui/card";
</script>

<Card class="border-slate-800 bg-slate-900">
  <CardHeader>
    <CardTitle>Help & Documentation</CardTitle>
    <CardDescription class="text-slate-400">
      Learn how to use Bolt to GitHub effectively
    </CardDescription>
  </CardHeader>
  <CardContent class="space-y-4">
    <div class="space-y-2">
      <h3 class="text-lg font-semibold text-slate-200">Getting Started</h3>
      <p class="text-sm text-slate-400">
        1. Create a new project on bolt.new or open an existing one
      </p>
      <p class="text-sm text-slate-400">
        2. Configure your GitHub settings with your personal access token
      </p>
      <p class="text-sm text-slate-400">
        3. Set your repository details and branch name
      </p>
    </div>

    <div class="space-y-2">
      <h3 class="text-lg font-semibold text-slate-200">Important Note</h3>
      <p class="text-sm text-slate-400">
        ⚠️ This extension cannot function if Bolt encounters an error. Please ensure your Bolt project is working correctly before attempting to use this extension.
      </p>
    </div>

    <div class="space-y-2">
      <h3 class="text-lg font-semibold text-slate-200">Need More Help?</h3>
      <p class="text-sm text-slate-400">
        Visit our GitHub repository for detailed documentation, issues, and updates.
      </p>
    </div>
  </CardContent>
</Card>
