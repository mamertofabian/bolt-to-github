export interface WhatsNewVersion {
  date: string;
  highlights: string[];
  details?: string;
  type: 'major' | 'minor' | 'patch';
}

export const whatsNewContent: Record<string, WhatsNewVersion> = {
  '1.3.22': {
    date: '2026-07-13',
    highlights: [
      '🔐 GitHub App Required - A Bolt2GitHub account and GitHub App connection now protect every GitHub action',
      '🧭 Clear Migration Guidance - Personal access token support has ended and the extension explains how to reconnect',
      '💾 Project Mappings Preserved - Existing repository and project mappings are preserved during migration',
      '🧹 Simpler Setup - One supported GitHub connection removes the confusing dual-integration path',
    ],
    details: `Bolt to GitHub now requires a Bolt2GitHub account and the GitHub App for GitHub features. Personal access token support has ended. If the extension finds retired credentials, it removes them, preserves your repository and project mappings, and shows the sign-in and GitHub App connection steps required to continue. This intentional simplification follows more than a year of recommending the GitHub App; historical standalone usage could not be measured reliably, so this release makes no zero-usage claim.`,
    type: 'patch',
  },
  '1.3.21': {
    date: '2026-07-13',
    highlights: [
      '👋 Cleaner First Install - New installs now open only the welcome page',
      '🚫 No Duplicate Login Tabs - Empty sessions no longer trigger automatic sign-in tabs',
      '🔐 Recovery Preserved - Existing invalid sessions still guide you back to sign in',
      '🛡️ GitHub App Retry Loop Fixed - Incomplete connections no longer trigger repeated background checks',
      '⚙️ Stable Background Checks - Missing installation details no longer start repeated token checks',
      '✨ Helpful Pro Follow-Up - Successful pushes can now show a lightweight Pro feature suggestion',
    ],
    details: `This cumulative Chrome Web Store release includes the v1.3.20 reliability improvements plus a cleaner first-install experience. New installs open only the welcome page instead of launching duplicate login tabs, while existing invalid sessions keep their guided recovery path. GitHub App checks no longer repeat endlessly when installation details are missing, open Bolt tabs receive clearer recovery guidance, and successful pushes may show a lightweight suggestion for a relevant Pro feature.`,
    type: 'patch',
  },
  '1.3.20': {
    date: '2026-07-12',
    highlights: [
      '🛡️ GitHub App Retry Loop Fixed - Incomplete connections no longer trigger repeated background checks',
      '⚙️ Stable Background Checks - Missing installation details no longer start repeated token checks',
      '✨ Helpful Pro Follow-Up - Successful pushes can now show a lightweight Pro feature suggestion',
    ],
    details: `This release improves GitHub App reliability by stopping repeated background checks when a connection is missing required installation details. Open Bolt tabs also receive clearer refresh guidance during authentication recovery, and successful pushes may show a lightweight suggestion for a relevant Pro feature.`,
    type: 'patch',
  },
  '1.3.19': {
    date: '2026-07-03',
    highlights: [
      '🛡️ Clearer Push Errors - Failed pushes now surface what went wrong with a retry option instead of failing silently',
      '🔐 More Reliable Auth Recovery - The extension can recover from stale sign-ins without requiring a manual disable/enable cycle',
      '🔗 GitHub App Stays Connected - Re-authentication preserves your GitHub App connection instead of making you reconnect it',
      '📝 Repository Name Validation - Invalid repository names are caught consistently before a push can fail',
      '🔄 Reconnect Notices - Open Bolt tabs show a refresh-to-reconnect notice if an extension reload or update disconnects the injected UI',
    ],
    details: `This release focuses on reliability. Push failures now tell you what went wrong and let you retry right away, authentication recovers more reliably after stale sessions or extension reloads, GitHub App connections survive normal re-authentication, and open Bolt tabs show a clear reconnect notice when a page refresh is needed.`,
    type: 'patch',
  },
  '1.3.18': {
    date: '2026-05-30',
    highlights: [
      'Push to GitHub Button Restored - Fixed button injection after Bolt moved the Share/Publish toolbar',
      'Toolbar Detection Hardened - Supports both legacy ml-auto layouts and the current Publish/Share anchored layout',
      'Regression Coverage - Added tests for the May 2026 toolbar structure',
    ],
    details: `Bolt's May 2026 toolbar restructure moved the Share/Publish button group out from under div.ml-auto, so the extension could no longer find the place to inject the Push to GitHub button. This release restores button injection by anchoring on the Publish/Share controls while keeping the old selector path for cached Bolt tabs.`,
    type: 'patch',
  },
  '1.3.17': {
    date: '2026-05-08',
    highlights: [
      '🛠️ Download Flow Restored – Fixed export/download after Bolt swapped the chevron icon from Lucide to Phosphor',
      '🎯 Icon-Library Agnostic Selectors – Works across Lucide, Phosphor, and Heroicons variants',
    ],
    details: `Bolt's May 2026 redesign swapped the project-name dropdown chevron from Lucide to Phosphor, breaking the entire export/download flow. This release ships icon-library agnostic selectors so the same code keeps working across Lucide, Phosphor, and Heroicons variants, plus regression tests and a packaged recovery skill so future Bolt redesigns get fixed in minutes instead of hours.`,
    type: 'patch',
  },
  '1.3.16': {
    date: '2026-04-04',
    highlights: [
      '🔐 Independent Auth – Extension auth no longer breaks when the website session expires or rotates',
      '📋 Commits List Modal (Pro) – View commit history with pagination and link to GitHub',
      '✏️ Editable Repo Settings – Rename your project title and repository directly',
      '🐛 Bug Fix – Fixed inability to rename repository in settings',
    ],
    details: `This release solves the #1 reported issue: authentication randomly breaking. The extension now mints its own independent session, so website token rotation or session expiry no longer affects it. Also adds a new Pro feature to browse your commit history, and fixes the repo rename bug.`,
    type: 'patch',
  },
  '1.3.15': {
    date: '2026-03-27',
    highlights: [
      '🔧 Auth Lifecycle Recovery – Fixed persistent auth failure after inactivity in MV3 service worker',
      '🔑 Supabase Token Handling – Tracks 30-day refresh token expiration with proactive validation',
      '🛡️ GitHub App Token Validation – Validates Supabase token expiry to prevent cascade failures',
      '⏰ Chrome Alarms API – Periodic auth checks survive service worker termination',
    ],
    details: `This release fixes a critical authentication issue where the extension would stop working after periods of inactivity, requiring users to manually toggle the extension off/on. Auth recovery now handles both 401 and 403 responses, eliminates stale token caching, and uses Chrome alarms for periodic checks that survive MV3 service worker restarts.`,
    type: 'patch',
  },
  '1.3.14': {
    date: '2026-03-08',
    highlights: [
      '🌿 Branch Dropdown – Select or create branches directly from repo settings with auto-filtering',
      "🔧 Fixed Button Injection – Updated for bolt.new's latest UI changes",
      "🎨 Updated Styling – Button now matches bolt.new's current design system",
      '🔄 Dropdown Toggle – Click the GitHub button again to close the dropdown',
    ],
    details: `This update fixes the GitHub button injection that broke after bolt.new updated their toolbar layout. The button styling now uses bolt.new's latest design tokens for a seamless look. Plus, you can now select or create branches directly from the repo settings with a new auto-filtering dropdown.`,
    type: 'patch',
  },
  '1.3.13': {
    date: '2025-10-22',
    highlights: [
      'Fixed notification spam when Bolt.new tabs are in background',
      'Smart rate limiting - notifications limited to once every 5 minutes',
      'Background tab detection for better user experience',
      'Persistent reminder settings that survive browser restarts',
      'Scheduled reminders now disabled by default (opt-in)',
      'Better timer management for Chrome background tab throttling',
      'State persistence to browser storage',
      '24-hour inactivity reset for relevant notifications',
      'Improved pending notification queue management',
      'Eliminated notification spam in background tabs',
      'Fixed notification buildup when tabs become visible again',
      'Improved handling of Chrome timer throttling',
    ],
    details: `No more notification spam! This update eliminates the annoying notification buildup that occurred when Bolt.new tabs were running in the background. Chrome throttles timers in background tabs, causing queued notifications to fire rapidly when tabs become visible again. The extension now includes smart rate limiting, background tab detection, and persistent settings to provide a much cleaner user experience.`,
    type: 'patch',
  },
  '1.3.12': {
    date: '2025-10-01',
    highlights: [
      '🔄 Auto-Recovery from Auth Expiry – Extension automatically reloads to fix authentication issues',
      '⚡ Manifest V3 Optimization – Reliable service worker reloads using chrome.alarms API',
      '🛡️ Enhanced Stability – Persistent reload throttling prevents loops across restarts',
      '🧪 Improved Testing – 30+ new tests ensure robust authentication recovery',
    ],
    details: `No more manual extension restarts! The extension now automatically recovers from persistent authentication failures by intelligently reloading itself after 3 consecutive failures. This fix addresses the critical Manifest V3 service worker timeout issues and ensures a seamless user experience even when auth expires.`,
    type: 'patch',
  },
  '1.3.11': {
    date: '2025-01-15',
    highlights: [
      '🎨 Updated for New Bolt.new Design – Seamless integration with the latest UI changes',
      '🔧 Fixed GitHub Button Injection – Now works with the new header layout structure',
      '📥 Enhanced Download Functionality – Updated to work with project name dropdown export flow',
      '⚡ Eliminated Color Flash – Button appears with correct styling immediately',
      '🎯 Improved Button Placement – Smart targeting of GitHub button container',
    ],
    details: `The extension has been fully updated to work with Bolt.new's latest design changes! The GitHub button now seamlessly integrates with the new header layout, download functionality works with the updated export flow through the project name dropdown, and we've eliminated the initial color flash for a smoother user experience. All styling has been updated to match the new #1E1E21 color scheme.`,
    type: 'minor',
  },
  '1.3.10': {
    date: '2025-08-14',
    highlights: [
      '🔧 Bolt.new Header Integration Fix – Updated to work with new header layout',
      '🔄 Enhanced Re-authentication Flow – Better authentication handling and user guidance',
      '📥 Export Button Detection Update – Fixed export/download functionality',
    ],
    details: `The extension now works seamlessly with bolt.new's updated header layout! GitHub button injection and export/download functionality have been restored and enhanced with improved authentication flow for a better user experience.`,
    type: 'patch',
  },
  '1.3.9': {
    date: '2025-07-09',
    highlights: [
      '🪟 Pop-out mode – open the extension in its own window that never closes when you click away',
    ],
    details: `You can now pop the extension out into a dedicated window! Click the new pop-out button in the header and keep the UI visible while you work elsewhere.`,
    type: 'minor',
  },
  '1.3.8': {
    date: '2025-07-08',
    highlights: [
      '🚀 Reliable Export / Download – now works with Bolt’s new 3-dots menu',
      '⚡ Lighter CPU footprint on project pages',
      '🛡️ More graceful error handling during downloads',
    ],
    details: `Downloads work again! The extension now detects Bolt’s redesigned Export → Download flow and runs with lower resource usage for a smoother experience.`,
    type: 'minor',
  },
  '1.3.7': {
    date: '2025-06-25',
    highlights: [
      '📝 Auto README Generation - Projects without READMEs get smart documentation',
      '🔄 Smart Content Detection - Preserves existing documentation, replaces empty files',
    ],
    details: `Never push projects without documentation again! Automatic README generation creates meaningful documentation for projects that need it, while preserving any existing content you've already written.`,
    type: 'minor',
  },
  '1.3.6': {
    date: '2025-06-14',
    highlights: [
      '🔄 Project Sync - Your Bolt projects now sync automatically across devices',
      '🛡️ Data Loss Prevention - Fixed critical race conditions in storage operations',
      '⚡ Enhanced Reliability - Background sync every 5 minutes keeps everything current',
    ],
    details: `Never lose your Bolt projects mapping to GitHub repositories again! This major stability update includes automatic cross-device synchronization, critical race condition fixes, and enhanced error handling for bulletproof project management.`,
    type: 'minor',
  },
  '1.3.5': {
    date: '2025-06-13',
    highlights: [
      '🎉 Welcome page for new users with onboarding guide',
      '⚡ Enhanced stability - Service worker improvements prevent timeouts',
      '🛡️ Better error handling and reconnection logic',
    ],
    details: `Performance boost with message throttling and improved reliability. New users get a helpful welcome flow!`,
    type: 'minor',
  },
  '1.3.4': {
    date: '2025-06-12',
    highlights: [
      "✨ What's New modal - Stay updated with new features automatically",
      '📚 Access version history from Help tab',
      '🎨 Beautiful glassmorphism design',
    ],
    details: `Get notified about updates when the extension upgrades. Access previous versions from the Help tab anytime.`,
    type: 'minor',
  },
  '1.3.3': {
    date: '2025-06-10',
    highlights: [
      '🔧 Fixed push reminder configuration',
      '💬 Progress messages for long operations',
      '🎯 Better error handling',
    ],
    details: `Improved user experience with reassuring messages and bug fixes.`,
    type: 'patch',
  },
  '1.3.2': {
    date: '2025-06-10',
    highlights: [
      '🔐 GitHub App Authentication Introduced',
      '🚀 Scoped Repository Access',
      '⚙️ Automatic Repository Owner Configuration',
    ],
    details: `This version introduced GitHub App authentication with scoped repository access and automatic configuration.

See [README.md](https://github.com/mamertofabian/bolt-to-github#readme) for full changelog.`,
    type: 'minor',
  },
};
