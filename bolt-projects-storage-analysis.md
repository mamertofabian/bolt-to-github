# Bolt Projects Storage Analysis

## Status Update (December 2024)

⚠️ **Critical Race Conditions**: **FIXED** in PR #124  
✅ **Thread-Safe Storage**: Implemented for all project settings operations  
🚀 **Ready for Migration**: Foundation work complete, can proceed with boltProjects migration

## Overview

The extension currently maintains two parallel storage formats for Bolt projects:

1. **Legacy Format** (`projectSettings`) - Used by the UI and existing features
2. **New Format** (`boltProjects`) - Used for backend synchronization

## Storage Format Details

### 1. Legacy Format: `projectSettings`

**Storage Location**: `chrome.storage.sync`  
**Key**: `projectSettings`  
**Structure**:

```javascript
{
  "github-5q8boznj": {
    "branch": "main",
    "projectTitle": "github-5q8boznj",
    "repoName": "github-5q8boznj"
  },
  "github-6vr3ocx2": {
    "branch": "main",
    "projectTitle": "github-6vr3ocx2",
    "repoName": "github-6vr3ocx2"
  }
}
```

**Individual Project Keys** (rarely used):

- Pattern: `projectSettings.${projectId}`
- Example: `projectSettings.github-5q8boznj`
- Only referenced in `src/services/settings.ts:36`

### 2. New Format: `boltProjects`

**Storage Location**: `chrome.storage.local`  
**Key**: `boltProjects`  
**Structure**:

```javascript
[
  {
    id: 'github-5q8boznj',
    bolt_project_id: 'github-5q8boznj',
    project_name: 'github-5q8boznj',
    github_repo_name: 'github-5q8boznj',
    github_repo_owner: 'mamertofabian',
    github_branch: 'main',
    is_private: false,
    last_modified: '2025-06-16T00:30:01.431Z',
    sync_status: 'pending',
    version: 1,

    // Legacy compatibility fields
    repoName: 'github-5q8boznj',
    branch: 'main',
  },
];
```

## Current Usage Analysis

### Legacy Format (`projectSettings`) Usage

1. **UI Components**

   - `ProjectsList.svelte:32` - Displays project list
   - `RepoSettings.svelte:141-160` - Manages repository settings
   - `GitHubSettings.svelte:32` - Receives as prop

2. **Core Services**

   - `chromeStorage.ts:11,41,54,80,122-151` - CRUD operations
   - `zipHandler.ts:127-157,215-218` - Repository mapping for downloads
   - `FileChangeHandler.ts:148-160` - File change detection
   - `settings.ts:15-49` - Project settings management

3. **Stores**
   - `projectSettings.ts:106-108` - Project title retrieval

### New Format (`boltProjects`) Usage

1. **Storage Operations**

   - `chromeStorage.ts:647-739` - Complete CRUD interface
   - Local storage for larger data capacity
   - Sync timestamp tracking

2. **Sync Service**

   - `BoltProjectSyncService.ts` - Core synchronization logic
   - Backend API integration
   - Conflict resolution
   - Migration utilities

3. **Background Service**
   - `BackgroundService.ts:1296-1343` - Periodic sync (5 minutes)
   - Manual sync trigger support

## Migration & Compatibility

### Current Bidirectional Sync

The `BoltProjectSyncService` maintains both formats:

1. **Forward Migration** (`syncProjectsFromLegacyFormat`):

   - Converts `projectSettings` → `boltProjects`
   - Adds backend-required fields
   - Preserves existing data

2. **Backward Sync** (`syncBackToActiveStorage`):
   - Updates `projectSettings` from `boltProjects`
   - Maintains UI compatibility
   - Runs after each sync operation

### Key Challenges

1. **Dual Maintenance**

   - Every update requires syncing both formats
   - Risk of data inconsistency
   - Complex debugging

2. **Storage Limitations**

   - `chrome.storage.sync` has size limits
   - Individual keys pattern underutilized
   - Mixed storage locations (sync vs local)

3. **Field Mapping Complexity**

   - Different field names (branch vs github_branch)
   - Backend-specific fields mixed with UI fields
   - Legacy compatibility requirements

4. **User Impact**
   - ~1000 existing users with legacy data
   - Cannot break existing functionality
   - Migration must be seamless

## Critical Code Paths & Race Conditions

### Read Operations

1. **UI Display**: `ProjectsList` → store → `chromeStorage.getGitHubSettings()`
2. **Download Handler**: `zipHandler` → `chromeStorage.getProjectSettings(projectId)`
3. **Settings**: `RepoSettings` → direct chrome.storage access

### Write Operations (RACE CONDITIONS STATUS)

#### 1. **RepoSettings.svelte** ✅ FIXED

- ~~**BYPASSES** ChromeStorageService entirely~~
- ~~Direct `chrome.storage.sync.set()` with read-modify-write pattern~~
- **FIXED**: Now uses `ChromeStorageService.saveProjectSettings()`
- **FIXED**: Removed timestamp workaround - now handled by storage service

#### 2. **ChromeStorageService.saveProjectSettings()** ✅ FIXED

- ~~Same read-modify-write pattern, no locking~~
- **FIXED**: Added `StorageWriteQueue` class for serializing operations
- **FIXED**: All writes now go through thread-safe write queue
- **FIXED**: Added timestamp tracking for race condition detection

#### 3. **Multiple Writers** ⚠️ PARTIALLY FIXED

##### Fixed:

- ✅ `RepoSettings.svelte`: Now uses ChromeStorageService
- ✅ `githubSettings.ts:99`: `repoOwner` write now uses `saveGitHubSettings()`
- ✅ `App.svelte:326-328`: Auto-creates via ChromeStorageService
- ✅ `settings.ts`: All operations use ChromeStorageService
- ✅ `ProjectsList.svelte:533`: Delete operation now uses `deleteProjectSettings()`
- ✅ `zipHandler.ts:146`: Default settings creation uses `saveProjectSettings()`

##### Still Direct (Lower Priority):

- ⚠️ `AnalyticsService`: Direct writes for analytics data
- ⚠️ `PATAuthenticationStrategy`: Single remove operation
- ⚠️ `GitHubAppService`: Single remove operation
- ⚠️ Various services writing non-project data (usage, premium status, etc.)

### Specific Race Condition Scenarios

1. **User Edits + Background Sync**

   - User saves in RepoSettings → triggers sync
   - Sync reads stale data before write completes
   - Sync overwrites user's changes

2. **Multiple Tab Saves**

   - User has multiple tabs open
   - Saves settings in both tabs
   - Last save wins, first save lost

3. **Auto-create + Manual Edit**
   - App auto-creates default settings
   - User simultaneously editing settings
   - Timing determines which data persists

### Sync Operations

1. **Periodic**: Background alarm → outward sync → backward sync
2. **Manual**: UI trigger → full sync cycle
3. **Migration**: Legacy detection → conversion → save

## Storage Location Rationale

- **Legacy (`projectSettings`)**: Uses `chrome.storage.sync` for cross-device sync
- **New (`boltProjects`)**: Uses `chrome.storage.local` for:
  - Larger storage capacity
  - Backend sync metadata
  - Avoiding sync storage conflicts

## Test Coverage

Comprehensive tests exist for:

- Storage operations (both formats)
- Migration logic
- Sync functionality
- Background service integration
- Edge cases and error handling

Tests total: 1,061 passing

## Critical Finding: Race Conditions (UPDATE - Dec 2024)

### Summary

The implementation had **severe race conditions** that could cause data loss. **Most critical issues have been FIXED**.

### Fixed Issues ✅

1. **ChromeStorageService Thread Safety**

   - **FIXED**: Added `StorageWriteQueue` class to serialize all operations
   - **FIXED**: All projectSettings writes now thread-safe
   - **FIXED**: Added timestamp tracking for conflict detection
   - **FIXED**: Added `deleteProjectSettings()` method for safe deletion

2. **Direct Storage Writers (Project Data)**

   - ✅ **RepoSettings.svelte**: Now uses ChromeStorageService
   - ✅ **ProjectsList.svelte**: Delete operation now thread-safe
   - ✅ **zipHandler.ts**: Default settings creation now thread-safe
   - ✅ **githubSettings.ts**: repoOwner updates now thread-safe
   - ✅ **App.svelte**: Auto-creation now uses ChromeStorageService
   - ✅ **settings.ts**: All operations now use ChromeStorageService

3. **Storage Change Listener**
   - **FIXED**: Implemented `setupStorageListener()` for reactive updates
   - **FIXED**: Removed timestamp workaround in RepoSettings

### Remaining Issues (Lower Priority) ⚠️

1. **Non-Project Data Writers**
   - AnalyticsService: Direct writes for analytics preferences
   - PremiumService: Direct writes for premium status
   - Various services: Usage tracking, auth state, etc.
   - **Impact**: Lower risk - these don't affect critical project settings

### Impact of Fixes

- ✅ **Data Loss Prevention**: Project settings now protected by write queue
- ✅ **Multi-Tab Safety**: Concurrent saves are serialized
- ✅ **Sync Conflict Detection**: Timestamp tracking enables detection
- ✅ **Better UX**: Consistent behavior across tabs

### Next Steps

1. **Complete Lower Priority Fixes**: Update remaining services for consistency
2. **Proceed with Migration**: Race conditions no longer block boltProjects migration
3. **Add Monitoring**: Track queue depth and operation timing in production
