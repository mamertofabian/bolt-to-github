# Bolt Projects Storage Analysis

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

### Write Operations (CRITICAL RACE CONDITIONS)

#### 1. **RepoSettings.svelte (Lines 141-160)**

- **BYPASSES** ChromeStorageService entirely
- Direct `chrome.storage.sync.set()` with read-modify-write pattern
- **Race Condition**: Multiple saves = data loss (last write wins)
- Also writes timestamp to local storage (lines 166-174) as reactivity workaround

#### 2. **ChromeStorageService.saveProjectSettings() (Lines 140-147)**

- Same read-modify-write pattern, no locking
- **Race Condition**: Concurrent calls overwrite each other
- No conflict detection or resolution

#### 3. **Multiple Uncoordinated Writers**

- `RepoSettings.svelte`: Direct storage writes
- `githubSettings.ts:339`: Writes entire settings object
- `App.svelte:326-328`: Auto-creates project settings
- `BoltProjectSyncService`: Updates both storage formats
- **Result**: Unpredictable data state, potential data loss

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

## Critical Finding: Race Conditions

### Summary

The current implementation has **severe race conditions** that can cause data loss:

1. **RepoSettings.svelte bypasses ChromeStorageService**

   - Lines 141-160: Direct `chrome.storage.sync.set()` calls
   - No coordination with other components
   - Read-modify-write pattern without locking

2. **Multiple Uncoordinated Writers**

   - RepoSettings.svelte (direct writes)
   - ChromeStorageService (service layer)
   - githubSettings store (state management)
   - BoltProjectSyncService (sync operations)

3. **No Conflict Resolution**
   - Last write wins
   - No version control
   - No merge strategy
   - Users lose data silently

### Impact

- **Data Loss**: Settings saved in one tab overwritten by another
- **Sync Conflicts**: Background sync overwrites user changes
- **Poor UX**: Unpredictable behavior, settings "disappear"

### Required Fix

Must implement storage coordination BEFORE any migration:

- Centralize all writes through single service
- Implement write queue for serialization
- Add conflict detection and resolution
- Use chrome.storage.onChanged for reactivity
