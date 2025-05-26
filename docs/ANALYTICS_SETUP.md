# Analytics Setup Guide

This guide explains how to set up and use the privacy-compliant analytics system for the Bolt to GitHub extension.

## Overview

The analytics system is designed to be Chrome Web Store (CWS) compliant by:

- ✅ **No remote scripts** - Uses Google Analytics Measurement Protocol instead of loading remote scripts
- ✅ **CORS compliant** - All analytics requests are made from the background script (service worker)
- ✅ **User consent** - Analytics can be disabled by users
- ✅ **Privacy-focused** - Only collects anonymous usage data, never code or personal information
- ✅ **Transparent** - Clear privacy controls and data collection disclosure

## Technical Architecture

### CORS Handling

To avoid CORS issues, all analytics requests are routed through the background script:

1. **Content Script** → sends message → **Background Script** → makes analytics request
2. **Popup** → sends message → **Background Script** → makes analytics request
3. **Background Script** → directly makes analytics requests

### Message-Based System

```typescript
// From content script or popup
chrome.runtime.sendMessage({
  type: 'ANALYTICS_EVENT',
  eventType: 'extension_opened',
  eventData: { context: 'popup' },
});

// Background script handles the actual analytics call
```

## Setup Instructions

### 1. Get Google Analytics 4 API Secret

1. Go to [Google Analytics](https://analytics.google.com/)
2. Navigate to your property → Admin → Data Streams
3. Select your web stream
4. Click "Measurement Protocol API secrets"
5. Create a new secret and copy the API secret key

### 2. Configure Environment Variables

Add your Google Analytics configuration to your environment:

```bash
# .env file
VITE_GA4_API_SECRET=your_api_secret_here
```

The Measurement ID (`G-6J0TXX2XW0`) is already configured in the code, but you can change it in:

```typescript
// src/services/AnalyticsService.ts
private readonly GA4_MEASUREMENT_ID = 'G-6J0TXX2XW0';
```

### 3. Build and Test

```bash
pnpm build
```

Load the extension in Chrome and test analytics by:

1. Opening the popup
2. Connecting to a Bolt.new project
3. Uploading files to GitHub
4. Check your Google Analytics dashboard for events

## What Data is Collected

### Extension Lifecycle

- Extension installations and updates
- Extension opens (popup/content script)
- Version information

### User Journey

- Onboarding progress
- Setup completion
- Feature usage patterns

### GitHub Operations

- Repository creation attempts
- File upload operations
- Commit and push operations
- Success/failure rates
- Performance metrics (duration)

### Error Tracking

- Error types and frequencies
- Context information for debugging
- No sensitive data (tokens, code content)

### User Preferences

- Settings changes
- Privacy preference changes
- Feature enablement/disablement

## Privacy Controls

### User Toggle

Users can disable analytics through the settings UI:

```svelte
<AnalyticsToggle />
```

This component provides:

- Clear explanation of data collection
- Easy toggle to disable/enable
- Transparent data usage policy

### Automatic Respect for User Choice

The analytics service automatically checks user preferences before sending any data:

```typescript
// All tracking methods check this first
const enabled = await analytics.isAnalyticsEnabled();
if (!enabled) return;
```

## Development Usage

### From Background Script (Direct)

```typescript
import { trackExtensionEvent } from '../lib/utils/analytics';

// Track any extension event directly
await trackExtensionEvent('button_clicked', {
  buttonName: 'upload',
  context: 'popup',
});
```

### From Content Script or Popup (Message-Based)

```typescript
import { sendAnalyticsToBackground } from '../lib/utils/analytics';

// Send analytics event to background script
sendAnalyticsToBackground('extension_event', {
  eventType: 'button_clicked',
  details: { buttonName: 'upload', context: 'popup' },
});

// Or send directly via chrome.runtime.sendMessage
chrome.runtime.sendMessage({
  type: 'ANALYTICS_EVENT',
  eventType: 'bolt_project_event',
  eventData: {
    eventType: 'detected',
    projectMetadata: { projectName: 'my-project' },
  },
});
```

### GitHub Operations

```typescript
import { trackGitHubRepoOperation } from '../lib/utils/analytics';

// Track repository operations
await trackGitHubRepoOperation('create', true, {
  repoName: 'my-project',
  isNewRepo: true,
});
```

### Error Tracking

```typescript
import { trackError } from '../lib/utils/analytics';

try {
  // Some operation
} catch (error) {
  await trackError('upload', error, 'file_processing');
}
```

### Performance Monitoring

```typescript
import { withAnalytics } from '../lib/utils/analytics';

// Wrap functions to automatically track performance
const trackedUpload = withAnalytics(uploadFunction, 'file_upload', (fileName) => ({ fileName }));
```

### User Journey Tracking

```typescript
import { trackConversionFunnel } from '../lib/utils/analytics';

// Track conversion milestones
await trackConversionFunnel('first_use', {
  userType: 'new',
  source: 'popup',
});
```

## Analytics Events Reference

### Categories

1. **extension_usage** - General extension interactions
2. **github_operations** - GitHub API operations
3. **user_journey** - User onboarding and milestones
4. **user_preferences** - Settings and preference changes
5. **errors** - Error tracking for debugging
6. **performance** - Operation timing and performance

### Common Events

- `extension_installed` / `extension_updated`
- `extension_opened`
- `project_detected`
- `download_initiated` / `download_completed`
- `repo_creation` / `file_upload`
- `settings_opened` / `setting_changed`

## Privacy Compliance

### Chrome Web Store Compliance

✅ **No Remote Scripts**: Uses Measurement Protocol API calls instead of loading external scripts

✅ **User Control**: Clear opt-out mechanism with default consent

✅ **Data Minimization**: Only collects essential usage data

✅ **Transparency**: Clear disclosure of what data is collected

### GDPR Considerations

- Analytics is opt-in by design (defaults to enabled but can be disabled)
- Clear privacy notice explaining data collection
- No personal data collection
- User can withdraw consent at any time

## Monitoring and Debugging

### Check Analytics Status

```typescript
import { analytics } from '../services/AnalyticsService';

const summary = await analytics.getAnalyticsSummary();
console.log('Analytics Status:', summary);
```

### Development Mode

During development, you can check the browser console for analytics logs:

```javascript
// Enable verbose logging
localStorage.setItem('analytics_debug', 'true');
```

## Troubleshooting

### Common Issues

1. **Events not showing in GA4**

   - Check API secret is correct
   - Verify measurement ID matches your property
   - Ensure user hasn't disabled analytics

2. **Permission errors**

   - Verify `https://www.google-analytics.com/*` is in host_permissions

3. **TypeScript errors**
   - Ensure environment variables are properly typed in vite-env.d.ts

### Testing Analytics

1. **Local Testing**

   ```bash
   # Check if events are being sent
   chrome://extensions/ → Developer mode → Inspect views: service worker
   ```

2. **GA4 Real-time Reports**
   - Go to Reports → Real-time in Google Analytics
   - Trigger events in the extension
   - Events should appear within 1-2 minutes

## Best Practices

1. **Always check user consent** before tracking
2. **Use descriptive event names** for better analysis
3. **Include relevant metadata** but avoid sensitive data
4. **Track both success and failure** cases
5. **Be mindful of rate limits** (don't spam events)
6. **Test thoroughly** before releasing

## Support

For issues with analytics setup or implementation, please:

1. Check this documentation
2. Review the browser console for errors
3. Test with a simple event first
4. Open an issue with detailed steps to reproduce
