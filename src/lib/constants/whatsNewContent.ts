export interface WhatsNewVersion {
  date: string;
  highlights: string[];
  details?: string;
  type: 'major' | 'minor' | 'patch';
}

export const whatsNewContent: Record<string, WhatsNewVersion> = {
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
