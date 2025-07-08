# Popup Window Mode Feature

This document describes the implementation of the popup window mode feature for the Bolt to GitHub Chrome extension, as requested in GitHub Issue #148.

## Overview

The popup window mode feature allows users to open the extension popup in a separate Chrome window, preventing it from closing when focus is lost. This improves the user experience for workflows that require switching between the extension and other applications.

## Features Implemented

### 1. Window Management Service (`src/background/WindowManager.ts`)

A singleton service that handles:

- Creating popup windows with correct dimensions (420x640px)
- Managing existing window instances (focusing if already open)
- Preventing duplicate windows
- Cleaning up window references when windows are closed
- Positioning windows appropriately on the screen

Key methods:

- `openPopupWindow()`: Creates or focuses the popup window
- `closePopupWindow()`: Closes the popup window
- `isPopupWindowOpen()`: Checks if a window is currently open
- `updatePopupWindow()`: Updates window dimensions/position

### 2. Window Mode Utilities (`src/lib/utils/windowMode.ts`)

Utility functions for:

- Detecting current window mode (popup vs window)
- Opening popup windows from the frontend
- State synchronization between popup and window modes
- Window dimension constants

Key exports:

- `isWindowMode()`: Detects if running in window mode
- `openPopupWindow()`: Requests window opening from background service
- `WindowModeStateSync`: Class for cross-mode state management

### 3. UI Integration (`src/popup/App.svelte`)

Added:

- Pop-out button in the header (only visible in popup mode)
- Window mode detection on app initialization
- Handler for pop-out button clicks
- Icon from `lucide-svelte` (ExternalLink)

### 4. Background Service Integration

Enhanced `BackgroundService.ts` with:

- WindowManager instance integration
- Message handler for `OPEN_POPUP_WINDOW` requests
- Proper cleanup of window resources

### 5. Manifest Updates

Added required permissions:

- `system.display`: For display information (if needed)

## Technical Details

### Window Creation Flow

1. User clicks pop-out button in popup
2. `handlePopOutClick()` calls `openPopupWindow()` utility
3. Utility sends `OPEN_POPUP_WINDOW` message to background service
4. Background service calls `WindowManager.openPopupWindow()`
5. WindowManager checks for existing window or creates new one
6. URL includes `?mode=window` parameter for mode detection
7. Current popup closes after successful window creation

### Mode Detection

The extension detects its current mode by checking the URL parameter:

- Popup mode: No `mode` parameter or `mode=popup`
- Window mode: `mode=window`

### State Synchronization

The `WindowModeStateSync` class provides utilities for sharing state between popup and window modes using Chrome storage APIs with a `windowMode_` prefix.

### Window Lifecycle

- Windows are created with `type: 'popup'` for proper Chrome window behavior
- Event listeners track window close events to clean up references
- Only one popup window can exist at a time
- Existing windows are focused instead of creating duplicates

## User Experience

### Normal Flow

1. User clicks extension icon → popup opens
2. User clicks pop-out button → popup content opens in dedicated window
3. Original popup closes automatically
4. Window stays open when user clicks elsewhere or switches apps
5. User can minimize, resize, or close window normally

### Edge Cases Handled

- Multiple window creation attempts focus existing window
- Window position defaults to screen center
- Error handling for window creation failures
- Graceful degradation if permissions are missing

## Testing

### Unit Tests

- `WindowManager.test.ts`: Tests for window management functionality
- `windowMode.test.ts`: Tests for utility functions and state sync

Test coverage includes:

- Window creation and focusing
- Error handling
- State synchronization
- Mode detection
- Event listener behavior

## Files Modified/Created

### New Files

- `src/background/WindowManager.ts`
- `src/lib/utils/windowMode.ts`
- `src/background/__tests__/WindowManager.test.ts`
- `src/lib/utils/__tests__/windowMode.test.ts`

### Modified Files

- `src/background/BackgroundService.ts`: Added WindowManager integration
- `src/popup/App.svelte`: Added pop-out button and window mode detection
- `manifest.json`: Added `system.display` permission

## Future Enhancements

The following features were noted as out of scope for the initial implementation but could be added later:

- Remember window position/size preferences
- Keyboard shortcuts for pop-out
- Dock/undock functionality
- Multiple window support for different features
- Window positioning based on display configuration

## Browser Compatibility

This feature requires:

- Chrome extensions manifest v3
- Chrome.windows API
- Chrome.storage API
- Chrome.runtime messaging

All APIs used are standard Chrome extension APIs and should work across all supported Chrome versions.

## Security Considerations

- Window creation uses extension's own popup HTML file
- No external URLs are loaded in popup windows
- All Chrome extension security contexts are preserved
- State synchronization uses secure Chrome storage APIs

## Performance Notes

- WindowManager uses singleton pattern to minimize resource usage
- Event listeners are properly cleaned up on service destruction
- Window positioning calculations are optimized
- State synchronization is asynchronous and non-blocking
