export interface WhatsNewVersion {
  date: string;
  highlights: string[];
  details?: string;
  type: 'major' | 'minor' | 'patch';
}

export const whatsNewContent: Record<string, WhatsNewVersion> = {
  '1.3.12': {
    date: '2025-XX-XX',
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
      '🔐 GitHub App Authentication support',
      '🚀 Dual auth - PAT or GitHub App',
      '♻️ Zero breaking changes',
    ],
    details: `Modern authentication with GitHub Apps. More secure with auto-configuration.

See [README.md](https://github.com/mamertofabian/bolt-to-github#readme) for full changelog.`,
    type: 'minor',
  },
};
