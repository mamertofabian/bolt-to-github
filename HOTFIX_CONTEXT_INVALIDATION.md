# Context Invalidation Hotfix - Version 1.3.2

## Problem Description

A critical bug was identified in production version 1.3.1 where the Bolt to GitHub extension would become non-functional after approximately 5 minutes of usage. The issue manifested as:

1. GitHub button disappearing from bolt.new pages
2. Extension context invalidation after port disconnections
3. Continuous "UI manager not available" errors
4. Extension requiring manual page refresh to restore functionality

## Root Cause Analysis

The issue was caused by Chrome's service worker lifecycle management and inadequate recovery handling:

1. **Service Worker Termination**: Chrome automatically terminates inactive service workers after ~5 minutes
2. **Port Disconnection Pattern**: The logs showed a specific pattern:
   - Initial disconnect: "Port disconnected: No error message"
   - Brief reconnection attempt succeeds
   - Immediate second disconnect: "Could not establish connection. Receiving end does not exist"
   - Extension context invalidation detected
3. **Recovery Timing Issue**: During recovery, the background service continued sending `UPDATE_PREMIUM_STATUS` messages every 30 seconds, but the content script UIManager was null during recovery
4. **Message Processing During Recovery**: The extension tried to process messages before recovery was complete

## Important Distinction: Recoverable vs Unrecoverable

**Chrome extensions face two different types of disconnection scenarios:**

### 1. Recoverable: Service Worker Restart

- Chrome terminates the background service worker due to inactivity
- Extension context remains valid (`chrome.runtime.id` still exists)
- Content script can reconnect once service worker restarts
- **This CAN be recovered from automatically**

### 2. Unrecoverable: True Context Invalidation

- Extension reload/update in chrome://extensions
- Chrome internal context cleanup
- Content script becomes a "zombie" - running but disconnected
- `chrome.runtime.id` becomes undefined
- **This CANNOT be recovered from - requires page refresh**

## Technical Details

### The Problem Pattern (from logs):

```
08:33:59.440 - Port disconnected: No error message
08:33:59.440 - Normal port disconnect, attempting reconnection
08:34:00.964 - Connected to background service with port
08:34:01.000 - Port disconnected: Could not establish connection. Receiving end does not exist.
08:34:01.000 - Extension context invalidation detected
08:34:01.002 - All components cleaned up
[Continuous errors about UI manager not available]
```

The fact that reconnection briefly succeeded suggests this was likely a **service worker restart scenario** rather than true context invalidation, but the rapid second failure indicated deeper issues.

### Root Issues:

1. **Delayed Recovery**: Original code waited 2 seconds before attempting recovery
2. **No Message Protection**: Messages were processed during recovery when UIManager was null
3. **Inadequate Context Detection**: Quick successive disconnections weren't properly detected
4. **No Recovery Timeout**: Risk of getting stuck in recovery mode indefinitely
5. **No Distinction**: Didn't differentiate between recoverable and unrecoverable scenarios

## Hotfix Implementation

### Key Changes Made:

1. **Smart Recovery Strategy**:

   - Distinguish between service worker issues (recoverable) and true context invalidation (unrecoverable)
   - Attempt recovery for service worker issues
   - Show user notification for true context invalidation

2. **Recovery Mode Protection**:

   ```typescript
   private isInRecovery = false;

   // Ignore messages that depend on UIManager during recovery
   if (this.isInRecovery) {
     console.log('🔄 Ignoring UPDATE_PREMIUM_STATUS during recovery');
     sendResponse({ success: true, ignored: true });
     return;
   }
   ```

3. **Enhanced Context Invalidation Detection**:

   ```typescript
   // True context invalidation (unrecoverable)
   const trueInvalidationPatterns = [
     'Extension context invalidated',
     'chrome-extension://invalid/',
     'net::ERR_FAILED',
   ];

   // Service worker issues (potentially recoverable)
   const serviceWorkerPatterns = ['Could not establish connection', 'Receiving end does not exist'];

   // If it's a service worker issue but runtime is still available, try recovery
   if (isServiceWorkerIssue && chrome.runtime?.id) {
     return false; // Attempt normal reconnection
   }
   ```

4. **Graceful Degradation for Unrecoverable Cases**:

   ```typescript
   private handleUnrecoverableContextInvalidation(): void {
     // Try to use existing graceful notification system first
     if (this.uiManager) {
       this.notifyUserOfExtensionReload();
     } else {
       // Fallback: Simple, non-intrusive notification that doesn't auto-refresh
       this.showFallbackContextInvalidationNotification();
     }
   }
   ```

5. **Recovery Safety Timeout**:

   ```typescript
   // Prevent getting stuck in recovery mode indefinitely
   setTimeout(() => {
     if (this.isInRecovery) {
       console.warn('⚠️ Recovery timeout reached, clearing recovery flag');
       this.isInRecovery = false;
     }
   }, 30000);
   ```

6. **Protected Message Handlers**:
   - `UPDATE_PREMIUM_STATUS` - Now ignores messages during recovery
   - `SHOW_REAUTHENTICATION_MODAL` - Protected during recovery
   - `SHOW_SUBSCRIPTION_DOWNGRADE` - Protected during recovery
   - Background messages (`UPLOAD_STATUS`, `GITHUB_SETTINGS_CHANGED`, etc.) - Protected during recovery

### Debug Features Added:

- **Ctrl+Shift+D**: Test notification systems
- **Ctrl+Shift+R**: Test recovery mechanism manually

## Expected Behavior After Hotfix

1. **Service Worker Restart** (Recoverable):

   - Extension automatically detects service worker termination
   - Attempts reconnection when service worker restarts
   - Recovery happens within 1-2 seconds
   - GitHub button remains functional throughout

2. **True Context Invalidation** (Unrecoverable):

   - Extension detects it cannot recover
   - Shows graceful notification asking user to refresh page when convenient
   - Notification is dismissible and never auto-refreshes to avoid interrupting work
   - User can continue working and refresh manually when ready

3. **Message Protection**: Background messages are safely ignored during recovery instead of causing errors

4. **Timeout Protection**: Recovery mode automatically clears after 30 seconds to prevent being stuck

## Testing Instructions

### For Service Worker Restart (Recoverable):

1. Load a bolt.new project
2. Wait 5+ minutes for natural service worker termination
3. Verify GitHub button automatically recovers
4. Check console for "🎉 Recovery successful! Service worker reconnected."

### For True Context Invalidation (Unrecoverable):

1. Open bolt.new project with extension
2. Go to chrome://extensions and click "Reload" on Bolt to GitHub
3. Return to bolt.new tab
4. Should see amber notification asking to refresh page when convenient
5. Notification should be dismissible by clicking and never auto-refresh

### For Manual Testing:

1. Open bolt.new project with extension
2. Press `Ctrl+Shift+R` to simulate context invalidation
3. Verify appropriate recovery behavior

### For Load Testing:

1. Open multiple bolt.new tabs
2. Leave them idle for 10+ minutes
3. Test GitHub functionality across all tabs
4. Verify no "UI manager not available" errors

## File Changes

- `src/content/ContentManager.ts`:
  - Smart recovery logic distinguishing recoverable vs unrecoverable scenarios
  - Message protection during recovery
  - Enhanced context invalidation detection
  - Graceful degradation for unrecoverable cases
  - Recovery timeout safety mechanism

## Deployment Notes

- This is a critical hotfix for production users
- No breaking changes to API or storage
- Backward compatible with existing installations
- Can be deployed as patch update to 1.3.1
- Addresses the fundamental limitation of Chrome extension context invalidation

## Monitoring

After deployment, monitor for:

- Reduction in "UI manager not available" errors
- Successful recovery log messages for service worker restarts
- Appropriate graceful notifications for true context invalidation (no auto-refresh)
- Reduced user reports of non-functional extension
- Service worker restart handling

## Prevention for Future

1. Always distinguish between recoverable and unrecoverable scenarios
2. Implement appropriate responses for each case (recovery vs graceful degradation)
3. Test both service worker lifecycle and extension reload scenarios
4. Include timeout safety mechanisms for all recovery operations
5. Never attempt indefinite recovery from true context invalidation
6. Provide clear user feedback when manual intervention is required
7. **Never auto-refresh pages or interrupt user's work - always let user decide when to refresh**
