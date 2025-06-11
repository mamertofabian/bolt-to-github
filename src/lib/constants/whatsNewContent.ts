export interface WhatsNewVersion {
  date: string;
  highlights: string[];
  details?: string;
  type: 'major' | 'minor' | 'patch';
}

export const whatsNewContent: Record<string, WhatsNewVersion> = {
  '1.3.4': {
    date: '2025-01-11',
    highlights: [
      '✨ Stay informed about new features with automatic update notifications',
      "🎯 Never miss important changes - see what's new right after updates",
      '📚 Access version history anytime from the Help tab',
    ],
    details: `### What's New
- **Automatic Update Notifications**: You'll now see this modal automatically when Bolt to GitHub updates, keeping you informed about new features and improvements
- **Version History at Your Fingertips**: Click "What's New" in the Help tab anytime to revisit update information
- **Beautiful New Design**: Enjoy our new glassmorphism-styled modals that match the extension's modern look

### Why This Matters
- Stay up-to-date with new features without checking release notes
- Learn about improvements that can enhance your workflow
- Never miss important changes or new capabilities`,
    type: 'minor',
  },
  '1.3.3': {
    date: '2025-01-10',
    highlights: [
      '🎯 Push Reminders now work reliably - configure them without errors',
      '⚡ Smoother experience when opening the extension',
    ],
    details: `### Fixed Issues
- **Push Reminders Configuration**: The "Configure Push Reminders" button now works properly, allowing you to set up notifications for unsaved changes
- **No More Flickering**: The extension popup now opens smoothly without the authentication state flickering
- **Better Error Handling**: More graceful handling of unexpected situations`,
    type: 'patch',
  },
  '1.3.2': {
    date: '2025-01-09',
    highlights: [
      '🔐 More secure GitHub authentication with new GitHub App option',
      "💬 Helpful messages during long operations so you know what's happening",
      '🔄 Extension works reliably even after Chrome restarts',
    ],
    details: `### New Capabilities
- **GitHub App Authentication**: A more secure way to connect to GitHub with better permission control - no more worrying about token scopes
- **Progress Updates**: See reassuring messages during long operations like large file uploads, so you know the extension is working
- **Private Feedback Option**: Send sensitive feedback via email when needed

### Reliability Improvements
- **Works After Chrome Restarts**: No more losing connection after restarting Chrome
- **No Duplicate Buttons**: The GitHub button appears only once, as it should
- **Better Privacy**: Your feedback is more private and secure`,
    type: 'minor',
  },
  '1.3.1': {
    date: '2025-01-05',
    highlights: [
      '⚡ Faster and more responsive extension performance',
      '🛡️ More reliable uploads with better error recovery',
      '🔧 Extension stays stable during long work sessions',
    ],
    details: `### Performance & Stability
- **Faster Response Times**: The extension now responds more quickly to your actions
- **Reliable Uploads**: Upload failures are now rare, and when they happen, the extension recovers gracefully
- **Long Session Stability**: Work for hours without the extension slowing down or using too much memory
- **Better Error Messages**: When something goes wrong, you'll see helpful messages instead of cryptic errors`,
    type: 'patch',
  },
  '1.3.0': {
    date: '2024-12-28',
    highlights: [
      '🔔 Never lose work - get reminded about unsaved changes',
      '📊 Manage all your projects from one convenient dashboard',
      '✨ Beautiful new interface with modern glassmorphism design',
    ],
    details: `### Game-Changing Features
- **Push Reminders**: Set up notifications to remind you when you have unsaved changes - never accidentally lose your work again
- **Project Dashboard**: See all your Bolt projects in one place, making it easy to switch between them and track progress
- **Smart Notifications**: Get the right notifications at the right time, without being overwhelmed

### Visual Improvements
- **Modern Design**: Enjoy the new glassmorphism effects that make the extension look professional and modern
- **Better Performance**: Large projects now load and sync faster than ever
- **Clearer Error Messages**: When issues occur, you'll understand exactly what went wrong and how to fix it`,
    type: 'minor',
  },
};
