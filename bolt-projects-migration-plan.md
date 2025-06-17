# Bolt Projects Storage Migration Plan

## Executive Summary

Migrate from the current dual-storage system to a unified storage model using `boltProjects` as the single source of truth, while **fixing critical race conditions** and maintaining backward compatibility for existing users.

## Critical Issues to Address

### Race Conditions & Data Loss Risks

1. **Direct Storage Writes**: RepoSettings.svelte bypasses storage service
2. **Read-Modify-Write**: No locking mechanism, concurrent writes overwrite data
3. **Multiple Writers**: Uncoordinated writes from different components
4. **No Conflict Resolution**: Last write wins, earlier changes lost

## Goals

1. **Fix Race Conditions**: Implement proper storage coordination
2. **Simplify Storage**: Single source of truth in `boltProjects`
3. **Maintain Compatibility**: Zero disruption for existing users
4. **Improve Performance**: Reduce redundant operations
5. **Enable Future Features**: Clean architecture for new functionality

## Migration Strategy

### Phase 0: Fix Critical Race Conditions ✅ COMPLETED (Dec 2024)

~~Before any migration, we MUST fix the existing race conditions to prevent data loss.~~

#### 0.1 Centralize All Storage Writes ✅ DONE

- ✅ **Removed** direct chrome.storage calls from RepoSettings.svelte
- ✅ **Removed** direct calls from ProjectsList.svelte, zipHandler.ts, githubSettings.ts
- ✅ **Removed** direct calls from settings.ts and App.svelte
- ✅ Routed ALL project-related storage operations through ChromeStorageService
- ✅ Implemented a write queue to serialize operations

#### 0.2 Implement Storage Locking ✅ DONE

```typescript
// IMPLEMENTED in ChromeStorageService
class StorageWriteQueue {
  private queue: Promise<void> = Promise.resolve();
  private pendingOperations = 0;
  private totalOperations = 0;

  async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    // Full implementation with monitoring
  }

  getStats() {
    // Added for monitoring
    return { pendingOperations, totalOperations };
  }
}
```

#### 0.3 Add Conflict Detection ✅ PARTIALLY DONE

- ✅ Implemented timestamp tracking for race condition detection
- ✅ BoltProjectSyncService uses timestamps to detect recent changes
- ⚠️ Version numbers not yet implemented (future enhancement)
- ✅ 30-second threshold prevents overwriting recent user changes

### Phase 1: Adapter Layer with Safe Storage (2 weeks)

Create an adapter layer that fixes race conditions AND provides format transparency.

#### 1.1 Create Thread-Safe Storage Adapter

```typescript
// src/lib/services/storageAdapter.ts
class StorageAdapterService {
  private writeQueue = new StorageWriteQueue();
  private cache = new Map<string, CachedProject>();

  // Thread-safe read with cache
  async getProjectSettings(): Promise<ProjectSettingsMap> {
    return this.cache.get('all') || this.loadFromStorage();
  }

  // Serialized writes with conflict detection
  async saveProjectSettings(projectId: string, settings: ProjectSetting) {
    return this.writeQueue.enqueue(async () => {
      const current = await this.loadFromStorage();
      const updated = this.mergeChanges(current, projectId, settings);
      await this.atomicWrite(updated);
    });
  }
}
```

#### 1.2 Update ALL Components

- Replace direct storage calls in RepoSettings.svelte
- Update githubSettings store to use adapter
- Remove timestamp workaround (no longer needed)

#### 1.3 Implement Storage Change Listeners

- Use chrome.storage.onChanged for reactive updates
- Eliminate manual reactivity workarounds
- Ensure UI consistency across tabs

### Phase 2: Progressive UI Migration (2-4 weeks)

Gradually update UI components to use the new format directly.

#### 2.1 Update Stores

- Create new `boltProjectsStore`
- Deprecate `projectSettings` store
- Add migration helpers

#### 2.2 Component Updates (Priority Order)

1. **ProjectsList.svelte** - Most visible component
2. **RepoSettings.svelte** - Critical for settings
3. **GitHubSettings.svelte** - Simple prop update
4. **FileChangeHandler.ts** - Background functionality
5. **zipHandler.ts** - Download handling

#### 2.3 Service Updates

- Update `settings.ts` to use new format
- Remove individual key pattern usage
- Consolidate storage operations

### Phase 3: Cleanup & Optimization (4-6 weeks)

Remove legacy code and optimize the system.

#### 3.1 Remove Bidirectional Sync

- Delete `syncBackToActiveStorage()` method
- Remove `syncProjectsFromLegacyFormat()` after migration complete
- Simplify sync service logic

#### 3.2 Storage Optimization

- Consider moving to `chrome.storage.sync` for boltProjects
- Implement storage quota management
- Add compression if needed

#### 3.3 Legacy Data Cleanup

- Add migration completion tracking
- Provide option to clean legacy data
- Monitor storage usage

## Implementation Details

### 1. Adapter Implementation Pattern

```typescript
// Transparent conversion layer
export class ProjectSettingsAdapter {
  private cache = new Map<string, ProjectSettings>();

  async getProjectSettings(): Promise<ProjectSettingsMap> {
    const boltProjects = await chromeStorage.getBoltProjects();
    return this.convertToLegacyFormat(boltProjects);
  }

  async saveProjectSettings(projectId: string, settings: ProjectSetting) {
    const boltProjects = await chromeStorage.getBoltProjects();
    const updated = this.updateBoltProject(boltProjects, projectId, settings);
    await chromeStorage.saveBoltProjects(updated);
  }
}
```

### 2. Migration Utilities

```typescript
// One-time migration for existing users
export async function migrateToUnifiedStorage() {
  const migrationKey = 'storage_migration_v2_completed';
  const completed = await chrome.storage.local.get(migrationKey);

  if (!completed[migrationKey]) {
    // Perform migration
    await performMigration();
    await chrome.storage.local.set({ [migrationKey]: true });
  }
}
```

### 3. Feature Flags

```typescript
// Gradual rollout control
export const StorageFeatures = {
  USE_UNIFIED_STORAGE: false, // Enable progressively
  LEGACY_COMPAT_MODE: true, // Disable after migration
  ENABLE_STORAGE_CLEANUP: false, // Enable in final phase
};
```

## Risk Mitigation

### 1. Data Safety

- **Backup**: Store legacy data before migration
- **Validation**: Verify data integrity after conversion
- **Rollback**: Keep rollback mechanism for 30 days

### 2. User Experience

- **Transparent**: No visible changes initially
- **Gradual**: Component-by-component migration
- **Monitoring**: Track errors and performance

### 3. Testing Strategy

- **Unit Tests**: Adapter layer coverage
- **Integration Tests**: Full flow validation
- **A/B Testing**: Gradual rollout to user segments

## Success Metrics

1. **Zero Data Loss**: All projects migrated successfully
2. **Performance**: 50% reduction in storage operations
3. **Code Simplification**: Remove 500+ lines of sync code
4. **User Satisfaction**: No increase in support tickets

## Updated Timeline (Race Conditions Fixed - Dec 2024)

- ✅ **Week 1 (COMPLETED)**: Fixed race conditions in current system
  - ✅ Day 1-2: Centralized storage writes, removed direct calls
  - ✅ Day 3-4: Implemented write queue and locking
  - ✅ Day 5: Tested with comprehensive race condition test suite
- **Week 2-3 (NEXT)**: Implement thread-safe adapter layer
- **Week 4-5**: Begin UI component migration
- **Week 6-7**: Complete migration and testing
- **Week 8-9**: Cleanup and optimization
- **Week 10+**: Monitor and support

## Immediate Action Items

1. ✅ **Race Condition Fixes (COMPLETED in PR #124)**:

   - ✅ Removed direct storage writes from RepoSettings.svelte
   - ✅ Added write queue to ChromeStorageService
   - ✅ Fixed ProjectsList.svelte, zipHandler.ts, githubSettings.ts
   - ✅ Added deleteProjectSettings() method
   - ✅ Comprehensive tests added (15 race condition tests passing)

2. **Next Priority**: Complete lower-priority storage fixes

   - Update AnalyticsService, PremiumService for consistency
   - Consider creating specialized storage methods for non-project data

3. **Begin Migration**: With race conditions fixed, can now proceed with adapter layer

## Alternative Approaches Considered

### 1. Big Bang Migration

- **Pros**: Quick, clean break
- **Cons**: High risk, user disruption
- **Decision**: Too risky for 1000+ users

### 2. Versioned Storage

- **Pros**: Clear versioning
- **Cons**: Complex maintenance
- **Decision**: Over-engineered for this use case

### 3. Status Quo

- **Pros**: No immediate risk
- **Cons**: Technical debt, complexity
- **Decision**: Long-term maintenance burden

## Recommendation (Updated Dec 2024)

✅ **Phase 0 COMPLETE**: Critical race conditions have been fixed!

1. ✅ **Data Loss Prevention**: Project settings now protected by write queue
2. ✅ **Thread-Safe Implementation**: All critical writes serialized
3. ✅ **Transparent to Users**: No visible changes, improved reliability
4. ✅ **Foundation Ready**: Safe storage now enables migration

**NOW** proceed with the Thread-Safe Adapter approach (Phase 1):

1. **Build on Fixed Foundation**: Race conditions no longer a blocker
2. **Implement Adapter Layer**: Provide transparent format conversion
3. **Maintain Compatibility**: Support both formats during transition
4. **Enable Incremental Migration**: Component-by-component updates

**Lower Priority Cleanup**:

- Update remaining services (Analytics, Premium, etc.) for consistency
- These don't block migration as they don't touch project settings

## Summary (Updated Dec 2024)

The race condition fixes have been successfully implemented. Progress update:

1. ✅ **DONE** - Fixed critical race conditions in PR #124

   - All project settings operations now thread-safe
   - Write queue prevents concurrent operation conflicts
   - Comprehensive test coverage added

2. **NEXT** - Implement thread-safe adapter (2 weeks)

   - Create format conversion layer
   - Maintain backward compatibility
   - Enable gradual migration

3. **THEN** - Migrate to unified storage (6-8 weeks)
   - Update UI components progressively
   - Remove dual format maintenance
   - Simplify sync logic

The critical foundation work is complete. We can now proceed with the migration knowing that user data is protected by thread-safe operations.
