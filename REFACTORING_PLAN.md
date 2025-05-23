# UIManager.ts Refactoring Plan

## Current State Analysis

The `UIManager.ts` file is currently a monolithic class with 926 lines handling multiple responsibilities:

### Current Responsibilities:

1. **Singleton Management** - Instance management and initialization
2. **UI Component Management** - Svelte component lifecycle (UploadStatus, Notification)
3. **Button Management** - GitHub button creation, state updates, and dropdown handling
4. **Upload/Download Operations** - GitHub push workflow and file operations
5. **Notification System** - Various types of notifications and confirmation dialogs
6. **File Change Detection** - File comparison and preview functionality
7. **DOM Manipulation** - Direct DOM element creation and management
8. **Event Handling** - Click events, mutation observer, keyboard events
9. **State Management** - Upload status, button states, and component states
10. **Settings Integration** - GitHub settings validation and management

### Current Dependencies:

- `MessageHandler` (injected dependency)
- `SettingsService` (static service)
- `DownloadService` (instantiated service)
- `FilePreviewService` (singleton service)
- `UploadStatus.svelte` (Svelte component)
- `Notification.svelte` (Svelte component)

## Refactoring Strategy

### Phase 1: Extract UI Component Managers

#### 1.1 Create `NotificationManager`

**File**: `src/content/managers/NotificationManager.ts`

**Responsibilities**:

- Manage notification component lifecycle
- Handle different notification types (info, error, success)
- Manage notification positioning and timing
- Handle confirmation dialogs

**Interface**:

```typescript
interface NotificationManager {
  showNotification(options: NotificationOptions): void;
  showConfirmationDialog(options: ConfirmationOptions): Promise<ConfirmationResult>;
  cleanup(): void;
}
```

**Extracted Methods**:

- `showNotification()`
- `showGitHubConfirmation()`
- `showSettingsNotification()`

#### 1.2 Create `UploadStatusManager`

**File**: `src/content/managers/UploadStatusManager.ts`

**Responsibilities**:

- Manage UploadStatus component lifecycle
- Handle status updates and state transitions
- Manage component positioning and visibility

**Interface**:

```typescript
interface UploadStatusManager {
  updateStatus(status: UploadStatusState): void;
  initialize(): void;
  cleanup(): void;
}
```

**Extracted Methods**:

- `initializeUploadStatus()`
- `updateUploadStatus()`
- `updateUploadStatusInternal()`

#### 1.3 Create `GitHubButtonManager`

**File**: `src/content/managers/GitHubButtonManager.ts`

**Responsibilities**:

- GitHub button creation and lifecycle
- Button state management
- Event handling for button interactions

**Interface**:

```typescript
interface GitHubButtonManager {
  initialize(): Promise<void>;
  updateState(isValid: boolean): void;
  cleanup(): void;
}
```

**Extracted Methods**:

- `initializeUploadButton()`
- `createGitHubButton()`
- `updateButtonState()`

#### 1.4 Create `DropdownManager`

**File**: `src/content/managers/DropdownManager.ts`

**Responsibilities**:

- Dropdown creation and content management
- Positioning and visibility
- Event handling for dropdown interactions

**Interface**:

```typescript
interface DropdownManager {
  show(button: HTMLButtonElement): Promise<void>;
  hide(): void;
  createContent(): HTMLElement;
}
```

**Extracted Methods**:

- `handleGitHubDropdownClick()`
- `createGitHubDropdownContent()`

### Phase 2: Extract Business Logic Handlers

#### 2.1 Create `GitHubUploadHandler`

**File**: `src/content/handlers/GitHubUploadHandler.ts`

**Responsibilities**:

- Handle GitHub push workflow
- File download and conversion
- Error handling and retries
- Integration with background services

**Interface**:

```typescript
interface GitHubUploadHandler {
  handleGitHubPush(): Promise<void>;
  validateSettings(): Promise<boolean>;
}
```

**Extracted Methods**:

- `handleGitHubPushAction()`

#### 2.2 Create `FileChangeHandler`

**File**: `src/content/handlers/FileChangeHandler.ts`

**Responsibilities**:

- File change detection and comparison
- Integration with FilePreviewService
- File change display and logging

**Interface**:

```typescript
interface FileChangeHandler {
  showChangedFiles(): Promise<void>;
  loadProjectFiles(forceRefresh?: boolean): Promise<void>;
}
```

**Extracted Methods**:

- `handleShowChangedFiles()`

### Phase 3: Extract Infrastructure Components

#### 3.1 Create `DOMObserver`

**File**: `src/content/infrastructure/DOMObserver.ts`

**Responsibilities**:

- Mutation observer setup and management
- DOM change detection
- Retry logic for initialization

**Interface**:

```typescript
interface DOMObserver {
  start(callback: () => void): void;
  stop(): void;
}
```

**Extracted Methods**:

- `setupMutationObserver()`

#### 3.2 Create `UIElementFactory`

**File**: `src/content/infrastructure/UIElementFactory.ts`

**Responsibilities**:

- Factory methods for creating UI elements
- Consistent styling and behavior
- Reusable UI components

**Interface**:

```typescript
interface UIElementFactory {
  createButton(options: ButtonOptions): HTMLButtonElement;
  createDropdownContent(items: DropdownItem[]): HTMLElement;
  createDialog(options: DialogOptions): HTMLElement;
}
```

#### 3.3 Create `ComponentLifecycleManager`

**File**: `src/content/infrastructure/ComponentLifecycleManager.ts`

**Responsibilities**:

- Svelte component creation and destruction
- Component mounting and unmounting
- Memory leak prevention

**Interface**:

```typescript
interface ComponentLifecycleManager {
  createComponent<T>(constructor: any, target: Element, props: any): T;
  destroyComponent(component: any): void;
  cleanupAll(): void;
}
```

### Phase 4: Create Coordinating Services

#### 4.1 Create `UIStateManager`

**File**: `src/content/services/UIStateManager.ts`

**Responsibilities**:

- Centralized state management
- State transitions and validation
- Event coordination between components

**Interface**:

```typescript
interface UIStateManager {
  setUploadStatus(status: UploadStatusState): void;
  setButtonState(isValid: boolean): void;
  getState(): UIState;
}
```

#### 4.2 Refactored `UIManager`

**File**: `src/content/UIManager.ts` (refactored)

**Responsibilities**:

- Coordinate between all managers and handlers
- Maintain singleton pattern
- Handle initialization and cleanup
- Serve as facade for external interactions

**Interface** (simplified):

```typescript
class UIManager {
  // Public API methods that delegate to specific managers
  showNotification(options: NotificationOptions): void;
  updateUploadStatus(status: UploadStatusState): void;
  updateButtonState(isValid: boolean): void;
  handleGitHubPushAction(): Promise<void>;
  handleShowChangedFiles(): Promise<void>;

  // Lifecycle methods
  initialize(): Promise<void>;
  cleanup(): void;
  reinitialize(): void;
}
```

## Implementation Strategy

### Step 1: Create Base Interfaces and Types

- Define common interfaces and types in `src/content/types/`
- Create base classes for managers and handlers

### Step 2: Extract Notification System (Low Risk)

- Extract `NotificationManager` first as it has minimal dependencies
- Update UIManager to delegate notification calls
- Test thoroughly

### Step 3: Extract Upload Status Management

- Extract `UploadStatusManager`
- Update status update flow
- Test component lifecycle

### Step 4: Extract Button and Dropdown Management

- Extract `GitHubButtonManager` and `DropdownManager`
- Update event handling flow
- Test UI interactions

### Step 5: Extract Business Logic Handlers

- Extract `GitHubUploadHandler` and `FileChangeHandler`
- Update workflow orchestration
- Test end-to-end functionality

### Step 6: Extract Infrastructure Components

- Extract `DOMObserver` and supporting infrastructure
- Update initialization flow
- Test robustness

### Step 7: Final UIManager Refactoring

- Reduce UIManager to coordination logic only
- Implement proper dependency injection
- Final integration testing

## Benefits of This Refactoring

### 1. **Single Responsibility Principle**

Each class has one clear responsibility and reason to change.

### 2. **Improved Testability**

Smaller, focused classes are easier to unit test in isolation.

### 3. **Better Code Organization**

Related functionality is grouped together logically.

### 4. **Reduced Coupling**

Dependencies are explicit and can be easily mocked or replaced.

### 5. **Enhanced Maintainability**

Changes to specific functionality are contained within specific classes.

### 6. **Easier Feature Addition**

New features can be added by creating new managers or extending existing ones.

### 7. **Better Error Isolation**

Errors in one component don't cascade to unrelated functionality.

## Risk Mitigation

### 1. **Incremental Approach**

Refactor one component at a time to minimize risk of breaking changes.

### 2. **Comprehensive Testing**

Test each extracted component thoroughly before moving to the next.

### 3. **Interface Stability**

Maintain the same public API of UIManager during refactoring.

### 4. **Rollback Strategy**

Keep the original file as backup until refactoring is complete and tested.

### 5. **Progressive Enhancement**

Start with low-risk extractions (notifications) before tackling core functionality.

## File Structure After Refactoring

```
src/content/
├── UIManager.ts (refactored - coordination only)
├── managers/
│   ├── NotificationManager.ts
│   ├── UploadStatusManager.ts
│   ├── GitHubButtonManager.ts
│   └── DropdownManager.ts
├── handlers/
│   ├── GitHubUploadHandler.ts
│   └── FileChangeHandler.ts
├── infrastructure/
│   ├── DOMObserver.ts
│   ├── UIElementFactory.ts
│   └── ComponentLifecycleManager.ts
├── services/
│   └── UIStateManager.ts
├── types/
│   ├── UITypes.ts
│   ├── ManagerInterfaces.ts
│   └── HandlerInterfaces.ts
└── components/ (existing Svelte components)
    ├── UploadStatus.svelte
    └── Notification.svelte
```

This refactoring plan maintains all existing functionality while creating a more maintainable, testable, and extensible codebase.
