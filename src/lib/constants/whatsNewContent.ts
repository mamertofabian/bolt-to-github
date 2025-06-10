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
      '✨ New "What\'s New" modal for update notifications',
      '🎨 Enhanced glassmorphism UI styling',
      '📋 Version tracking and update management',
    ],
    details: `### New Features
- **What's New Modal**: Automatically displays when extension updates to inform users about new features
- **Version Tracking**: Smart tracking to show modal only once per version
- **Help Tab Integration**: Access update history anytime from the Help tab

### Improvements
- Enhanced modal styling with glassmorphism effects
- Responsive design for all screen sizes
- Markdown support for rich content formatting`,
    type: 'minor',
  },
  '1.3.3': {
    date: '2025-01-10',
    highlights: [
      '🐛 Fixed "Configure Push Reminders" button error',
      '🔧 Resolved authentication state flickering',
    ],
    details: `### Bug Fixes
- Fixed the "Configure Push Reminders" button error that prevented configuration
- Resolved authentication state flickering when opening the extension popup
- Improved error handling for edge cases`,
    type: 'patch',
  },
  '1.3.2': {
    date: '2025-01-09',
    highlights: [
      '🎉 New GitHub App Authentication',
      '🐛 Context invalidation fixes',
      '✨ Progress-responsive messages',
    ],
    details: `### New Features
- **GitHub App Authentication**: More secure alternative to PATs with enhanced permissions management
- **Progress Messages**: Reassuring feedback during long operations to keep users informed
- **Email Support**: Private feedback option for sensitive issues

### Bug Fixes
- Fixed context invalidation after Chrome restarts
- Prevented duplicate GitHub buttons from appearing
- Enhanced privacy in feedback submissions
- Improved state management across extension lifecycle`,
    type: 'minor',
  },
  '1.3.1': {
    date: '2025-01-05',
    highlights: [
      '🚀 Performance improvements',
      '🐛 Bug fixes and stability enhancements',
      '📝 Documentation updates',
    ],
    details: `### Improvements
- Optimized background script performance
- Enhanced error recovery mechanisms
- Updated user documentation

### Bug Fixes
- Fixed occasional upload failures
- Resolved memory leaks in long-running sessions
- Improved Chrome API error handling`,
    type: 'patch',
  },
  '1.3.0': {
    date: '2024-12-28',
    highlights: [
      '🎯 Push reminder notifications',
      '📊 Enhanced project management',
      '🔔 Smart notification system',
    ],
    details: `### Major Features
- **Push Reminders**: Get reminded when you have unsaved changes
- **Project Dashboard**: New centralized view for managing all projects
- **Smart Notifications**: Context-aware notifications that adapt to your workflow

### Improvements
- Redesigned UI with modern glassmorphism effects
- Better error messages and recovery options
- Enhanced performance for large repositories`,
    type: 'minor',
  },
};
