# UIManager.ts Refactoring Plan

## Overview

The `UIManager.ts` file is currently 926 lines long and handles multiple responsibilities. This refactoring plan aims to break it down into smaller, more manageable modules following the Single Responsibility Principle (SRP) while maintaining all existing functionalities.

## Current Structure Analysis

### Main Responsibilities

1. **Component Management**: Managing Svelte components (UploadStatus, Notification)
2. **Button Creation and Management**: Creating and managing GitHub upload button and dropdown
3. **Upload Process Orchestration**: Handling GitHub push workflow
4. **File Preview Operations**: Managing file change detection and display
5. **DOM Manipulation**: Creating and managing UI elements
6. **State Management**: Managing upload states and button states
7. **Notification System**: Showing various notifications to users

### Dependencies

- External services: `SettingsService`, `DownloadService`, `FilePreviewService`, `GitHubService`
- Svelte components: `UploadStatus.svelte`, `Notification.svelte`
- Types: `UploadStatusState`, `FileChange`, `NotificationOptions`
- Browser APIs: Chrome storage API, DOM manipulation

## Refactoring Strategy

### Phase 1: Extract Core Managers (Breaking Down by Responsibility)

#### 1. **NotificationManager** (`NotificationManager.ts`)

- **Responsibilities**:
  - Create and manage notification components
  - Show/hide notifications with different types
  - Auto-dismiss notifications after duration
  - Handle notification container lifecycle
- **Methods to Extract**:
  - `showNotification()`
  - `showSettingsNotification()` (refactored as generic notification)
  - Notification cleanup logic

#### 2. **GitHubButtonManager** (`GitHubButtonManager.ts`)

- **Responsibilities**:
  - Create GitHub upload button
  - Manage button state (enabled/disabled)
  - Create and manage dropdown menu
  - Position dropdown correctly
  - Handle button styling and icons
- **Methods to Extract**:
  - `createGitHubButton()`
  - `createGitHubDropdownContent()`
  - `handleGitHubDropdownClick()`
  - `updateButtonState()`
  - Button HTML templates

#### 3. **UploadStatusManager** (`UploadStatusManager.ts`)

- **Responsibilities**:
  - Create and manage upload status component
  - Update upload progress and messages
  - Handle component lifecycle
  - Manage container positioning
- **Methods to Extract**:
  - `initializeUploadStatus()`
  - `updateUploadStatus()`
  - `updateUploadStatusInternal()`
  - Container management logic

#### 4. **GitHubUploadManager** (`GitHubUploadManager.ts`)

- **Responsibilities**:
  - Orchestrate the GitHub upload process
  - Handle confirmation dialogs
  - Manage download and conversion process
  - Error handling for upload failures
  - Coordinate with DownloadService
- **Methods to Extract**:
  - `handleGitHubPushAction()`
  - `showGitHubConfirmation()`
  - Upload error handling logic
  - File download and conversion logic

#### 5. **FilePreviewManager** (`FilePreviewManager.ts`)

- **Responsibilities**:
  - Handle "Show Changed Files" functionality
  - Coordinate with FilePreviewService
  - Display file change summaries
  - Send messages to popup for file changes
- **Methods to Extract**:
  - `handleShowChangedFiles()`
  - File change counting logic
  - Console logging for changes
  - Storage of file changes

#### 6. **DOMObserverManager** (`DOMObserverManager.ts`)

- **Responsibilities**:
  - Set up and manage MutationObserver
  - Handle button initialization retries
  - Monitor DOM changes for button container
  - Cleanup observer on destroy
- **Methods to Extract**:
  - `setupMutationObserver()`
  - Retry logic for button initialization
  - Observer cleanup logic

### Phase 2: Create Coordinating UIManager

The refactored `UIManager.ts` will become a thin orchestration layer that:

- Maintains singleton pattern
- Initializes all sub-managers
- Delegates responsibilities to appropriate managers
- Coordinates communication between managers
- Handles cleanup of all sub-managers

### Phase 3: Shared Utilities and Types

#### 1. **UIConstants** (`constants/UIConstants.ts`)

- Extract all hardcoded values:
  - CSS classes
  - Z-index values
  - Timeouts and delays
  - Retry limits
  - Default messages

#### 2. **UITypes** (`types/UITypes.ts`)

- Define interfaces for:
  - Manager dependencies
  - Component props
  - Event handlers
  - Configuration options

#### 3. **DOMUtils** (`utils/DOMUtils.ts`)

- Helper functions for:
  - Element creation
  - Class manipulation
  - Style application
  - Container management

## Implementation Plan

### Step 1: Create Infrastructure (No Breaking Changes)

1. Create folder structure: `src/content/ui-managers/`
2. Create type definitions and interfaces
3. Create utility modules
4. Create constants file

### Step 2: Extract Managers (One at a Time)

1. Start with `NotificationManager` (least coupled)
2. Extract `UploadStatusManager`
3. Extract `GitHubButtonManager`
4. Extract `DOMObserverManager`
5. Extract `FilePreviewManager`
6. Extract `GitHubUploadManager` (most complex)

### Step 3: Refactor UIManager

1. Update UIManager to use new managers
2. Remove extracted methods
3. Update initialization logic
4. Test each extraction thoroughly

### Step 4: Optimization

1. Remove duplicate code
2. Optimize inter-manager communication
3. Add proper error boundaries
4. Improve type safety

## Benefits of This Refactoring

1. **Maintainability**: Each manager has a single, clear responsibility
2. **Testability**: Smaller units are easier to test in isolation
3. **Reusability**: Managers can be reused in other contexts
4. **Readability**: Code is organized by functionality
5. **Scalability**: Easy to add new features without touching unrelated code
6. **Debugging**: Issues are isolated to specific managers

## Risk Mitigation

1. **Incremental Approach**: Extract one manager at a time
2. **Maintain Backwards Compatibility**: Keep public API unchanged
3. **Comprehensive Testing**: Test after each extraction
4. **Feature Flags**: Use flags to switch between old and new implementations
5. **Rollback Plan**: Keep old code until new code is stable

## Success Metrics

1. File size: No single file > 200 lines
2. Cyclomatic complexity: Reduced by 70%
3. Test coverage: Increased to > 80%
4. Zero functional regressions
5. Improved developer experience

## Timeline Estimate

- Phase 1: 2-3 days (extraction of managers)
- Phase 2: 1 day (refactoring UIManager)
- Phase 3: 1 day (utilities and cleanup)
- Testing and stabilization: 2 days

Total: ~1 week for complete refactoring
