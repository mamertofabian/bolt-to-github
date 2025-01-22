<script lang="ts">
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '$lib/components/ui/card';
  import { CREATE_TOKEN_URL, CREATE_FINE_GRAINED_TOKEN_URL } from '../../services/GitHubService';
</script>

<Card class="border-slate-800 bg-slate-900">
  <CardHeader>
    <CardTitle>✨ Help & Documentation</CardTitle>
    <CardDescription class="text-slate-400">
      Learn how to use Bolt to GitHub effectively
    </CardDescription>
  </CardHeader>
  <CardContent class="space-y-6">
    <div class="space-y-2">
      <h3 class="text-lg font-semibold text-slate-200">🚀 Getting Started</h3>
      <p class="text-sm text-slate-400">
        1. Click the extension icon in your browser toolbar
      </p>
      <p class="text-sm text-slate-400">
        2. Follow the popup instructions to set up your GitHub access
      </p>
      <p class="text-sm text-slate-400">
        3. Once configured, you can use Bolt to GitHub from any bolt.new page
      </p>
    </div>

    <div class="space-y-3">
      <h3 class="text-lg font-semibold text-slate-200">🔑 GitHub Token Guide</h3>
      
      <div class="rounded-md bg-slate-800 p-4">
        <h4 class="mb-2 font-medium text-slate-200">🎯 Classic Personal Access Token</h4>
        <p class="mb-2 text-sm text-slate-400">
          Best for public repositories only. Quick to set up:
        </p>
        <ol class="ml-4 list-decimal text-sm text-slate-400">
          <li>Visit the <a href={CREATE_TOKEN_URL} target="_blank" class="text-blue-400 hover:underline">token creation page</a></li>
          <li>Optionally customize the token name</li>
          <li>Click "Generate token" at the bottom and copy the token</li>
          <li>Paste the token into the "GitHub Token" field in the "Settings" tab</li>
        </ol>
      </div>

      <div class="rounded-md bg-slate-800 p-4">
        <h4 class="mb-2 font-medium text-slate-200">🔐 Fine-Grained Access Token</h4>
        <p class="mb-2 text-sm text-slate-400">
          Required for private repository access. Setup steps:
        </p>
        <ol class="ml-4 list-decimal text-sm text-slate-400">
          <li>Visit the <a href={CREATE_FINE_GRAINED_TOKEN_URL} target="_blank" class="text-blue-400 hover:underline">fine-grained token page</a></li>
          <li>Set token expiration (or choose "No expiration")</li>
          <li>Configure repository access:
            <ul class="ml-4 list-disc">
              <li>Select "All repositories"</li>
            </ul>
          </li>
          <li>Configure Permissions:
            <ul class="ml-4 list-disc">
              <li>Click the "Repository permissions"</li>
              <li>Enable "Administration" (Read & Write)</li>
              <li>Enable "Contents" (Read & Write)</li>
            </ul>
          </li>
          <li>Generate and copy your token</li>
          <li>Paste the token into the "GitHub Token" field in the "Settings" tab</li>
        </ol>
      </div>
    </div>

    <div class="space-y-2">
      <h3 class="text-lg font-semibold text-slate-200">🔒 Private Repository Import</h3>
      <div class="rounded-md bg-slate-800/50 p-3 text-sm text-slate-400">
        <p>When importing private repositories:</p>
        <ol class="ml-4 mt-2 list-decimal">
          <li>A temporary public clone is created</li>
          <li>Bolt starts importing from this clone</li>
          <li>The temporary repository is automatically deleted after 2 minutes</li>
        </ol>
        <div class="mt-3 p-2 bg-amber-900/30 rounded border border-amber-700/30">
          <p class="text-amber-400 font-medium">Important:</p>
          <p class="mt-1">After importing a private repository, immediately go to the Settings tab and select your imported repository. This ensures your Bolt changes sync with the correct repository. Skip this step only if you want to create a new repository instead.</p>
        </div>
        <p class="mt-2 text-amber-400">
          Note: Fine-grained token is required for this feature
        </p>
      </div>
    </div>

    <div class="space-y-2">
      <h3 class="text-lg font-semibold text-slate-200">💡 Need More Help?</h3>
      <ul class="space-y-2 text-sm text-slate-400">
        <li>• Visit our <a href="https://github.com/mamertofabian/bolt-to-github" target="_blank" class="text-blue-400 hover:underline">GitHub repository</a> for detailed documentation, issues, and updates</li>
        <li>• Join our <a href="https://aidrivencoder.com/discord" target="_blank" class="text-blue-400 hover:underline">Discord community</a> for support and discussions</li>
        <li>• Watch our <a href="https://aidrivencoder.com/youtube" target="_blank" class="text-blue-400 hover:underline">AI development tutorials</a> on YouTube for expert guidance and tips! 🎥</li>
      </ul>
    </div>
  </CardContent>
</Card>
