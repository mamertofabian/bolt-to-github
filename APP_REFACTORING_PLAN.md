# App.svelte Refactoring Plan

## Current State Analysis

The `App.svelte` component (509 lines) is a monolithic component that handles multiple responsibilities:

### Identified Issues

1. **Too many responsibilities** - manages state, UI, business logic, Chrome API interactions
2. **Large component size** - 509 lines violates the 300-line rule
3. **State complexity** - 20+ reactive variables managing different concerns
4. **Mixed concerns** - UI rendering, data fetching, validation, storage management all in one place
5. **Hard to test** - business logic tightly coupled to component
6. **Hard to maintain** - changes in one area can affect others

### Current Responsibilities

- **State Management**: GitHub settings, project settings, upload status, UI state
- **Chrome API Integration**: storage, messaging, tabs API
- **Business Logic**: settings validation, file changes management, temp repo handling
- **UI Rendering**: multiple tabs, modals, conditional layouts
- **Side Effects**: initialization, cleanup, event handling

## Refactoring Strategy

### Phase 1: Extract State Management (Priority: High)

**Goal**: Create focused Svelte stores for different state domains

#### 1.1 Create GitHub Settings Store

```typescript
// File: src/lib/stores/githubSettings.ts
```

**Responsibilities**:

- GitHub token, repo owner, repo name, branch
- Token validation state
- Settings validation logic
- Persist to Chrome storage

#### 1.2 Create Project Settings Store

```typescript
// File: src/lib/stores/projectSettings.ts
```

**Responsibilities**:

- Project-specific settings mapping
- Current project state
- Project ID parsing and management

#### 1.3 Create UI State Store

```typescript
// File: src/lib/stores/uiState.ts
```

**Responsibilities**:

- Active tab state
- Modal visibility states
- Loading/status states
- Error messaging

#### 1.4 Create Upload State Store

```typescript
// File: src/lib/stores/uploadState.ts
```

**Responsibilities**:

- Upload progress and status
- Upload messages
- Background port connection

### Phase 2: Extract Services (Priority: High)

**Goal**: Separate Chrome API interactions and business logic

#### 2.1 Chrome Storage Service

```typescript
// File: src/lib/services/chromeStorage.ts
```

**Responsibilities**:

- Centralized Chrome storage operations
- Type-safe storage keys
- Batch operations
- Error handling

#### 2.2 Chrome Messaging Service

```typescript
// File: src/lib/services/chromeMessaging.ts
```

**Responsibilities**:

- Background script communication
- Tab messaging
- Message type safety
- Event handling

#### 2.3 Project Detection Service

```typescript
// File: src/lib/services/projectDetection.ts
```

**Responsibilities**:

- URL parsing for Bolt projects
- Project ID extraction
- Site detection logic

#### 2.4 File Changes Service

```typescript
// File: src/lib/services/fileChangesManager.ts
```

**Responsibilities**:

- File changes storage/retrieval
- Modal state management
- Content script communication

#### 2.5 Temp Repo Service

```typescript
// File: src/lib/services/tempRepoManager.ts
```

**Responsibilities**:

- Temp repo detection
- Cleanup operations
- Modal coordination

### Phase 3: Extract UI Components (Priority: Medium)

**Goal**: Break down the main component into focused UI components

#### 3.1 Main Layout Component

```svelte
<!-- File: src/popup/components/AppLayout.svelte -->
```

**Responsibilities**:

- Main card wrapper
- Header and basic layout
- Version display

#### 3.2 Tab Container Component

```svelte
<!-- File: src/popup/components/TabContainer.svelte -->
```

**Responsibilities**:

- Tab navigation
- Tab content routing
- Tab state management

#### 3.3 Project Dashboard Component

```svelte
<!-- File: src/popup/components/ProjectDashboard.svelte -->
```

**Responsibilities**:

- Project-specific UI when on Bolt site
- Integrate ProjectStatus and other project components
- Handle project-level actions

#### 3.4 Onboarding Flow Component

```svelte
<!-- File: src/popup/components/OnboardingFlow.svelte -->
```

**Responsibilities**:

- Initial setup UI
- Settings introduction
- Getting started flow

#### 3.5 Settings Tab Component

```svelte
<!-- File: src/popup/components/SettingsTab.svelte -->
```

**Responsibilities**:

- Settings form wrapper
- Settings-specific layout
- Integration with GitHubSettings

### Phase 4: Extract Composables/Hooks (Priority: Medium)

**Goal**: Create reusable business logic

#### 4.1 Settings Management Composable

```typescript
// File: src/lib/composables/useSettings.ts
```

**Responsibilities**:

- Settings CRUD operations
- Validation logic
- Integration with stores

#### 4.2 Project Management Composable

```typescript
// File: src/lib/composables/useProject.ts
```

**Responsibilities**:

- Project lifecycle management
- Project switching logic
- URL-based project detection

#### 4.3 File Changes Composable

```typescript
// File: src/lib/composables/useFileChanges.ts
```

**Responsibilities**:

- File changes workflow
- Modal coordination
- Storage management

#### 4.4 Chrome Integration Composable

```typescript
// File: src/lib/composables/useChromeIntegration.ts
```

**Responsibilities**:

- Chrome API initialization
- Event listener setup
- Cleanup on unmount

### Phase 5: Extract Types and Interfaces (Priority: Low)

**Goal**: Centralize type definitions

#### 5.1 App Types

```typescript
// File: src/lib/types/app.ts
```

**Types to extract**:

- TempRepoMetadata
- App-specific interfaces
- State type definitions

#### 5.2 Store Types

```typescript
// File: src/lib/types/stores.ts
```

**Types to extract**:

- Store state interfaces
- Action types
- Derived state types

## Implementation Order

### Sprint 1: Foundation (Week 1) - ✅ IN PROGRESS

1. ✅ Extract state stores (Phase 1) - COMPLETED
2. ✅ Create Chrome services (Phase 2.1, 2.2) - COMPLETED
3. 🔄 Update App.svelte to use stores - NEXT

### Sprint 2: Business Logic (Week 2)

1. Extract remaining services (Phase 2.3-2.5)
2. Create core composables (Phase 4.1, 4.2)
3. Refactor App.svelte to use services

### Sprint 3: UI Components (Week 3)

1. Extract layout components (Phase 3.1, 3.2)
2. Create specialized components (Phase 3.3, 3.4)
3. Final App.svelte cleanup

### Sprint 4: Polish (Week 4)

1. Extract remaining composables (Phase 4.3, 4.4)
2. Centralize types (Phase 5)
3. Testing and documentation

## Success Criteria

### Quantitative Goals

- [ ] App.svelte reduced to < 150 lines
- [ ] No component > 300 lines
- [x] State management centralized in stores
- [x] Chrome API calls abstracted into services
- [ ] Business logic extracted into composables

### Qualitative Goals

- [ ] Single Responsibility Principle followed
- [ ] Easy to test individual components
- [ ] Clear separation of concerns
- [ ] Improved maintainability
- [ ] Better error handling
- [ ] Type safety maintained

## Risk Mitigation

### Breaking Changes Prevention

- [ ] Maintain existing prop interfaces
- [ ] Preserve all existing functionality
- [ ] Keep same event handling patterns
- [ ] Maintain Chrome extension permissions

### Testing Strategy

- [ ] Unit tests for new stores
- [ ] Integration tests for services
- [ ] Component tests for extracted components
- [ ] E2E tests for critical workflows

### Rollback Plan

- [ ] Feature flags for new components
- [ ] Incremental rollout capability
- [ ] Version control checkpoints
- [ ] Documentation of changes

## File Structure After Refactoring

```
src/
├── popup/
│   ├── App.svelte (< 150 lines)
│   └── components/
│       ├── AppLayout.svelte
│       ├── TabContainer.svelte
│       ├── ProjectDashboard.svelte
│       ├── OnboardingFlow.svelte
│       ├── SettingsTab.svelte
│       ├── FileChangesModal.svelte (existing)
│       └── TempRepoModal.svelte (existing)
├── lib/
│   ├── stores/
│   │   ├── githubSettings.ts
│   │   ├── projectSettings.ts
│   │   ├── uiState.ts
│   │   └── uploadState.ts
│   ├── services/
│   │   ├── chromeStorage.ts
│   │   ├── chromeMessaging.ts
│   │   ├── projectDetection.ts
│   │   ├── fileChangesManager.ts
│   │   └── tempRepoManager.ts
│   ├── composables/
│   │   ├── useSettings.ts
│   │   ├── useProject.ts
│   │   ├── useFileChanges.ts
│   │   └── useChromeIntegration.ts
│   └── types/
│       ├── app.ts
│       └── stores.ts
```

## Dependencies to Consider

### New Dependencies

- None required - using existing Svelte reactivity and TypeScript

### Existing Dependencies Impact

- Maintain compatibility with existing components
- Preserve Chrome extension API usage
- Keep current UI library integration

## Notes

- Maintain existing functionality 100%
- Prioritize type safety throughout refactoring
- Follow established patterns in the codebase
- Consider Chrome extension specific constraints
- Ensure proper cleanup of event listeners and connections
