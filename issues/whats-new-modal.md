# Feature: What's New Modal for Extension Updates

## Overview

Implement a "What's New" modal that automatically displays to users when they update to a new version of the Bolt to GitHub extension. The modal should use the same enhanced glassmorphism styling as the Notification component and appear in the top-right corner.

## User Stories

- As a user, I want to be automatically informed about new features and fixes when the extension updates
- As a user, I want to dismiss the modal and not see it again for the current version
- As a user, I want to be able to access the "What's New" information later from the Help tab

## Technical Requirements

### 1. Component Design

Create a new component `WhatsNewModal.svelte` that:

- Reuses the styling and positioning from `Notification.svelte`
- Appears in the top-right corner with glassmorphism effects
- Supports markdown content for rich formatting
- Has smooth animations (slide in/out)
- Includes version number in the header

### 2. Version Tracking

```typescript
// In background/StateManager.ts
interface WhatsNewState {
  lastShownVersion: string;
  dismissedVersions: string[];
  lastCheckTime: number;
}

// Check if should show modal
const shouldShowWhatsNew = (currentVersion: string, state: WhatsNewState): boolean => {
  return (
    state.lastShownVersion !== currentVersion && !state.dismissedVersions.includes(currentVersion)
  );
};
```

### 3. Content Structure

```typescript
// lib/constants/whatsNewContent.ts
export const whatsNewContent: Record<string, WhatsNewVersion> = {
  '1.3.3': {
    date: '2025-01-10',
    highlights: [
      '🐛 Fixed "Configure Push Reminders" button error',
      '🔧 Resolved authentication state flickering',
    ],
    details: `### Bug Fixes
- Fixed the "Configure Push Reminders" button error that prevented configuration
- Resolved authentication state flickering when opening the extension popup`,
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
- **GitHub App Authentication**: More secure alternative to PATs
- **Progress Messages**: Reassuring feedback during long operations
- **Email Support**: Private feedback option

### Bug Fixes
- Fixed context invalidation after Chrome restarts
- Prevented duplicate GitHub buttons
- Enhanced privacy in feedback submissions`,
    type: 'minor',
  },
};
```

### 4. Component Implementation

```svelte
<!-- components/WhatsNewModal.svelte -->
<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { marked } from 'marked';

  export let version: string;
  export let onDismiss: () => void;
  export let content: WhatsNewVersion;

  let visible = true;

  const handleClose = () => {
    visible = false;
    setTimeout(onDismiss, 300);
  };
</script>

<!-- Similar styling to Notification.svelte but with more space for content -->
```

### 5. Integration Points

#### Content Script Integration

```typescript
// content/index.ts
import { WhatsNewManager } from './managers/WhatsNewManager';

// Initialize after DOM ready
const whatsNewManager = new WhatsNewManager();
await whatsNewManager.checkAndShow();
```

#### Popup Integration

- Add "What's New" button in Help tab
- Show badge indicator when new version available
- Allow manual access to latest updates

### 6. Storage Strategy

```typescript
// Use chrome.storage.local for persistence
const STORAGE_KEY = 'whatsNew';

const saveWhatsNewState = async (state: WhatsNewState) => {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
};

const getWhatsNewState = async (): Promise<WhatsNewState> => {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (
    result[STORAGE_KEY] || {
      lastShownVersion: '',
      dismissedVersions: [],
      lastCheckTime: 0,
    }
  );
};
```

### 7. UI/UX Considerations

- **Position**: Top-right corner, same as notifications
- **Styling**: Enhanced glassmorphism matching Notification component
- **Animation**: Smooth slide-in from right with scale effect
- **Dismissal**: Click X or "Got it" button
- **Auto-show**: Once per version, with 2-second delay after page load
- **Z-index**: Higher than notifications to ensure visibility
- **Mobile**: Responsive design, full-width on small screens

### 8. Implementation Steps

1. [ ] Create `WhatsNewModal.svelte` component with Notification styling
2. [ ] Implement `WhatsNewManager` class for version tracking
3. [ ] Create content structure and populate with recent updates
4. [ ] Add storage management for version tracking
5. [ ] Integrate into content script initialization
6. [ ] Add manual trigger in Help tab
7. [ ] Test version detection and modal display
8. [ ] Add analytics tracking for modal views

### 9. Testing Requirements

- [ ] Version detection works correctly
- [ ] Modal only shows once per version
- [ ] Dismissal is properly tracked
- [ ] Content renders correctly (markdown support)
- [ ] Animations work smoothly
- [ ] Mobile responsiveness
- [ ] Storage persistence across sessions
- [ ] Manual trigger from Help tab works

### 10. Future Enhancements

- RSS/API feed for dynamic content updates
- Categorized updates (Features, Fixes, Improvements)
- User preference for auto-show behavior
- Changelog archive view
- Integration with GitHub releases

## Acceptance Criteria

- [ ] Modal appears automatically on version update
- [ ] Uses same glassmorphism styling as Notification component
- [ ] Positioned in top-right corner
- [ ] Smooth animations on show/hide
- [ ] Version tracking prevents repeated shows
- [ ] Manual access available from Help tab
- [ ] Mobile responsive design
- [ ] Markdown content support
