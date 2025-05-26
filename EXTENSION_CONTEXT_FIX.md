# Extension Context Invalidation Fix

## Problem Description

The extension was experiencing errors after being reloaded/updated in Chrome, preventing the GitHub button from appearing until manual refresh. The console showed these specific errors:

```
Denying load of chrome-extension://pcgdpmdbfboldeaeghpnommdaedbiinl/assets/FilePreviewService-a88161b7.js.
Resources must be listed in the web_accessible_resources manifest key in order to be loaded by pages outside the extension.

GET chrome-extension://invalid/ net::ERR_FAILED

TypeError: Failed to fetch dynamically imported module: chrome-extension://pcgdpmdbfboldeaeghpnommdaedbiinl/content/content.js
```

## Root Cause Analysis

1. **Extension Context Invalidation**: When Chrome reloads/updates an extension, the old extension context becomes invalid, but content scripts remain in the page with references to the old extension ID.

2. **Dynamic Import Issues**: The extension uses dynamic imports for code splitting, but these weren't properly listed in `web_accessible_resources`.

3. **Insufficient Error Detection**: The extension's context invalidation detection was too narrow and didn't catch all invalidation patterns.

4. **Page Visibility State Changes**: When users switch tabs or minimize/restore browser windows, the extension context can become stale.

## Fixes Implemented

### 1. Enhanced Web Accessible Resources

**File: `manifest.json`**

```json
{
  "web_accessible_resources": [
    {
      "resources": ["assets/*.js", "assets/*.css", "content/*.js", "src/content/*.js"],
      "matches": ["https://bolt.new/*"]
    }
  ]
}
```

This ensures all dynamically imported chunks are accessible from content scripts.

### 2. Improved Context Invalidation Detection

**File: `src/content/ContentManager.ts`**

```typescript
private isExtensionContextInvalidated(error: any): boolean {
  // Check for various extension context invalidation patterns
  if (!error?.message) return false;

  const invalidationPatterns = [
    'Extension context invalidated',
    'Extension context was invalidated',
    'Could not establish connection',
    'Receiving end does not exist',
    'The message port closed before a response was received',
    'chrome-extension://invalid/',
    'net::ERR_FAILED'
  ];

  return invalidationPatterns.some(pattern =>
    error.message.includes(pattern)
  );
}
```

Now catches more error patterns that indicate context invalidation.

### 3. Runtime Availability Check

**File: `src/content/index.ts`**

```typescript
function initializeContentManager() {
  try {
    // Check if chrome runtime is available to avoid context invalidation errors
    if (!chrome.runtime?.id) {
      console.warn('🔊 Chrome runtime not available, extension context may be invalidated');
      return;
    }

    manager = new ContentManager();
    // ... rest of initialization
  } catch (error) {
    // Enhanced error handling for context invalidation
    if (
      error instanceof Error &&
      (error.message.includes('Extension context invalidated') ||
        error.message.includes('chrome-extension://invalid/'))
    ) {
      console.log(
        '🔊 Extension context invalidated during initialization - user should refresh page'
      );
    }
  }
}
```

Prevents initialization when the Chrome runtime is unavailable.

### 4. Page Visibility Change Handling

**File: `src/content/index.ts`**

```typescript
// Handle page visibility changes which can cause extension context issues
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && manager) {
    // Check if extension context is still valid when page becomes visible
    try {
      if (!chrome.runtime?.id) {
        console.warn(
          '🔊 Extension context invalid after visibility change - manager needs refresh'
        );
        manager = null;
        initializeContentManager();
      }
    } catch (error) {
      console.warn('🔊 Extension context check failed after visibility change:', error);
    }
  }
});
```

Automatically reinitializes the content manager when the page becomes visible and the extension context is invalid.

## Build Process Integration

The `@crxjs/vite-plugin` automatically:

- Detects dynamically imported modules
- Adds them to `web_accessible_resources`
- Merges with manually specified resources
- Handles proper content script injection

## Expected Behavior After Fix

1. **Extension Reload**: After reloading the extension in `chrome://extensions`, the GitHub button should automatically appear without requiring a page refresh.

2. **Tab Switching**: Switching between tabs shouldn't cause the extension to lose functionality.

3. **Error Recovery**: If context invalidation occurs, the extension will attempt to recover gracefully.

4. **User Notifications**: Users will see helpful notifications when manual refresh is needed.

## Testing Instructions

1. Load the extension in Chrome
2. Navigate to a Bolt.new project
3. Verify the GitHub button appears
4. Go to `chrome://extensions` and click "Reload" on the extension
5. Return to the Bolt.new tab (without refreshing)
6. Verify the GitHub button still works correctly

## Prevention for Future

- Always check `chrome.runtime?.id` before extension API calls
- Use comprehensive error pattern matching for context invalidation
- Ensure all dynamically imported resources are in `web_accessible_resources`
- Handle page visibility state changes appropriately
- Implement graceful degradation when extension context is lost
