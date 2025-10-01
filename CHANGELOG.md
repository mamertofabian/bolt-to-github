## 2025-XX-XX - Version 1.3.12

### 🔧 Performance & Stability

- **Self-Healing Authentication** - Extension automatically reloads to fix persistent auth failures after 3 consecutive attempts
- **Reliable Service Worker Reloads** - Replaced unreliable setTimeout with chrome.alarms API for Manifest V3 compatibility
- **Persistent Reload Throttling** - Reload timestamp survives extension restarts to prevent reload loops (5-minute minimum)

### 🧪 Testing & Quality

- **Comprehensive Test Coverage** - Added 30 new tests for extension reload functionality
- **Race Condition Prevention** - Fixed concurrent failure tracking to prevent duplicate reload requests
- **Enhanced Error Handling** - Improved robustness for notification and alarm failures

### 🐛 Bug Fixes

- **Auth Expiry Recovery** - No more manual extension disable/enable needed when auth expires
- **Stale State Clearing** - Extension reload now properly clears all service worker memory state
- **Manifest V3 Compatibility** - Fixed service worker timeout issues with proper alarm-based timing

## 2025-01-15 - Version 1.3.11

### 🎉 New Features

- **New Bolt.new Design Integration** - Full compatibility with Bolt.new's updated UI design and color scheme (#1E1E21)
- **Smart Button Placement** - Intelligent targeting of GitHub button container within the new header layout structure
- **Enhanced Download Flow** - Updated export functionality to work with the new project name dropdown structure

### 🔧 Performance & Stability

- **Eliminated Color Flash** - Button now appears with correct styling immediately, preventing visual glitches
- **Robust Selector System** - Updated CSS selectors to work with new DOM structure and prevent future breakages
- **Improved Error Handling** - Enhanced debugging logs for better troubleshooting of dropdown and menu detection

### 🧪 Testing & Quality

- **Updated Test Suite** - All tests updated to reflect new DOM structure and selectors
- **JSDOM Compatibility** - Fixed CSS selector issues with `:not(.empty:hidden)` pseudo-class
- **Comprehensive Coverage** - Added tests for new button placement logic and dropdown detection

### 🐛 Bug Fixes

- **GitHub Button Injection** - Fixed button not appearing due to outdated CSS selectors
- **Download Functionality** - Resolved export button detection issues with new dropdown structure
- **Button Container Targeting** - Fixed selector from `div.flex.grow-1.basis-60` to `div.ml-auto > div.flex.gap-3`
- **CSS Pseudo-class Support** - Replaced unsupported `:not(.empty:hidden)` with `querySelectorAll` and filtering

### 📚 Documentation

- **Updated README** - Added comprehensive information about v1.3.11 changes
- **Enhanced What's New** - Detailed changelog with visual improvements and technical details
- **Code Documentation** - Added inline comments explaining new selector logic and button placement

## 2025-08-14 - Version 1.3.10

### 🔧 Performance & Stability

- **Enhanced Re-authentication Flow** - Improved SupabaseAuthService with proactive re-authentication triggers for better user guidance during token verification failures
- **Streamlined ZipHandler Re-authentication** - Refactored triggerReAuthentication method for improved error handling and user experience
- **Enhanced Logging** - Better logging for re-authentication events to aid in debugging and user experience

### 🐛 Bug Fixes

- **Bolt.new Header Integration Fix** - Updated button container selectors from `gap-2` to `gap-3` to work with new bolt.new header layout
- **Export Button Detection Update** - Enhanced export button detection to use new project status dropdown structure instead of deprecated overflow menu
- **GitHub Button Injection** - Ensured GitHub button injection works correctly with updated bolt.new header layout
- **Backward Compatibility** - Maintained compatibility with legacy export button detection as fallback

## 2025-07-09 - Version 1.3.9

### 🪟 Pop-out Window Mode

- Open the extension in its own window so it stays visible while you work

## 2025-07-08 – Version 1.3.8

### 🚀 Highlights

- **Reliable Export → Download** – Works with Bolt’s new overflow (three-dots) menu so pushes are back to one-click.
- **Lower CPU Usage** – Leaner page-watcher logic keeps your browser snappy.
- **Smoother Error Handling** – Fails gracefully and recovers without page reloads.

Thanks for the quick feedback that helped us ship this fix! 🎉

## 2025-06-25 - Version 1.3.7

### 🎉 New Features

- **Automatic README Generation** - Smart README creation for projects without meaningful documentation

  - **ReadmeGeneratorService** - New service for intelligent README detection and generation
  - **Push workflow integration** - Seamlessly integrated into ZipHandler push process
  - **Content preservation** - Preserves existing meaningful README content
  - **Case-insensitive detection** - Handles README, readme, Readme file variations
  - **Project branding** - Generated READMEs include project name and Bolt to GitHub attribution
  - **Empty file handling** - Automatically replaces empty or whitespace-only README files

- **Enhanced Analytics with Version Tracking** - Comprehensive analytics improvements for better insights
  - **Automatic version tracking** - All analytics events now include app version automatically
  - **Version upgrade/downgrade tracking** - Monitor extension updates in real-time
  - **New analytics methods** - Enhanced tracking capabilities:
    - `trackFeatureAdoption` - Monitor feature adoption rates across versions
    - `trackPerformance` - Track operation durations and performance metrics
    - `trackUserJourney` - Monitor user progress through workflows
    - `trackOperationResult` - Track success/failure rates with contextual data
    - `trackDailyActiveUser` - Enhanced DAU tracking with version information
    - `trackFeatureUsage` - Feature usage analytics with version correlation
  - **Enhanced error tracking** - Version information included in error reports for better debugging
  - **Privacy-compliant** - No PII collected in version tracking data

### 🔧 Performance & Stability

- **Background service improvements** - Enhanced version change detection on extension updates
- **Utility function enhancements** - New helper functions in analytics.ts for easier integration
- **Backward compatibility** - All existing analytics calls continue to work without changes

### 🧪 Testing & Quality Improvements

- **Comprehensive test coverage** - Added extensive tests for both new features:
  - **ReadmeGeneratorService tests** - Full test suite for README generation logic
  - **Analytics enhancement tests** - Versioning and enhanced analytics functionality tests
  - **Integration tests** - ZipHandler integration with README generation
- **Test fixtures improvements** - Enhanced ZipHandlerMocks with better test utilities

### 📚 Documentation & Development

- **Lint-check script** - Added new `pnpm run lint-check` command to package.json for development workflow
- **Code review integration** - Implemented PR review feedback and improvements
- **Enhanced commit messages** - Better structured commit history with conventional commits

### 🛠️ Technical Improvements

- **Service integration** - ReadmeGeneratorService integrated into existing ZipHandler workflow
- **Analytics architecture** - Enhanced AnalyticsService with modular tracking methods
- **Version management** - Improved version detection and tracking in BackgroundService
- **Error handling** - Enhanced error reporting with version context for better debugging

### 🐛 Bug Fixes

- **Duplicate function removal** - Fixed duplicate function in ZipHandlerMocks test fixture
- **Test file organization** - Reorganized test files for better maintainability
- **Analytics method consistency** - Ensured consistent method signatures across analytics functions

## 2025-06-14 - Version 1.3.6

### ⚠️ Important: This is a Major Stability Release

**Why This Update Matters:**

- **Fixes critical data loss bugs** that could cause your project settings to disappear
- **Prevents wrong repository pushes** during multi-tab usage
- **Ensures your projects are never lost** with automatic cross-device synchronization
- **Eliminates storage race conditions** that caused frustrating data overwrites

**Recommendation:** Update immediately to prevent project data loss.

### 🎉 New Features

- **Bolt Project Synchronization System** - Comprehensive bidirectional sync between local extension and backend server
  - **BoltProjectSyncService** - New service for managing project synchronization with backend
  - **Periodic background sync** - Automatic 5-minute interval syncing via Chrome alarms API
  - **Manual sync trigger** - Support for on-demand synchronization via message passing
  - **Conflict resolution** - Built-in handling for sync conflicts with multiple resolution strategies
  - **Migration bridge** - Seamless transition from legacy projectSettings to new boltProjects format
  - **Bidirectional data flow** - Projects sync from extension to server and vice versa
  - **Smart sync conditions** - Intelligent inward sync protection for projects with existing GitHub repositories

### 🔧 Performance & Stability

- **Critical Race Condition Fixes** - Eliminated data loss scenarios through thread-safe storage operations
- **Storage Write Queue** - Serialized all storage operations to prevent concurrent writes and data corruption
- **Enhanced logging system** - Debug logging now enabled in production environment by default
- **Comprehensive error handling** - Improved error reporting and recovery mechanisms in sync operations
- **Storage optimization** - Efficient Chrome storage integration with BoltProject interface
- **Authentication integration** - Seamless integration with existing Supabase authentication system
- **Conflict Detection** - Added timestamp tracking and 30-second threshold to prevent overwriting recent changes

### 🧪 Testing & Quality Improvements

- **Comprehensive test suite** - Added 325+ lines of test coverage for sync functionality
- **Background service tests** - Detailed testing of periodic sync and alarm management
- **Storage integration tests** - Tests for Chrome storage service with BoltProject data structures
- **Mock implementations** - Enhanced mocks for Chrome APIs, alarms, and message passing

### 🏗️ Architecture Improvements

- **New interfaces and types** - Added BoltProject, SyncRequest, and SyncResponse interfaces
- **Service integration** - BoltProjectSyncService integrated into BackgroundService
- **Message type expansion** - Added SYNC_BOLT_PROJECTS message type for manual sync triggers
- **Backend compatibility** - Project data structures aligned with backend ExtensionProject schema

### 🐛 Bug Fixes

- **CRITICAL: Data Loss Prevention** - Fixed race conditions that could cause project settings to disappear or be overwritten
- **Project Persistence Issues** - Eliminated scenarios where users would lose their GitHub repository mappings
- **Dropdown Simplification** - Removed complex premium features from GitHub dropdown for better reliability
- **TypeScript errors** - Resolved all TypeScript compilation issues in sync service
- **Storage format alignment** - Fixed inconsistencies between local and backend data formats
- **Field mapping corrections** - Updated API field names (deletedProjectIds → deletedProjects)
- **Project name requirements** - Added missing project_name field for backend compatibility
- **Logging configuration** - Fixed logger initialization patterns across sync service
- **Tab-based Project Tracking** - Fixed issue where wrong repository could be selected during multi-tab usage

### 📚 Documentation & Development

- **Code review integration** - Implemented AI Agents' code review suggestions throughout the codebase
- **Enhanced debugging** - Comprehensive logging with structured data for better troubleshooting
- **Technical debt reduction** - Refactored storage format terminology and reduced code duplication

### 🔄 Data Migration

- **Legacy project migration** - Automatic migration from old projectSettings format to new sync format
- **Backward compatibility** - Maintained compatibility with existing project data structures
- **Data consistency** - Ensured data integrity during migration and sync operations

## 2025-06-13 - Version 1.3.5

### 🎉 New Features

- **Post-installation welcome flow** - Added welcome page with onboarding for new users installing the extension
- **Uninstall feedback integration** - Track anonymous usage statistics and redirect to feedback page on uninstall

### 🧪 Testing & Quality Improvements

- **Comprehensive test suite overhaul** - Systematically fixed all failing tests following unit testing best practices
- **Test coverage refinement** - Excluded test-fixtures directories from coverage calculations to focus metrics on production code
- **Enhanced test infrastructure** - Improved mocks for Chrome APIs, DOM, and ES module support

### 🔧 Performance & Stability

- **Service worker stability** - Added keep-alive mechanism with Chrome alarms API to prevent service worker timeout
- **Message flooding prevention** - Implemented debouncing and throttling in PremiumService and SupabaseAuthService
- **Enhanced error handling** - Improved reconnection logic and message deduplication in ContentManager

### 📚 Documentation

- **Unit testing best practices guide** - Added comprehensive testing rules and guidelines
- **Updated development workflow** - Enhanced CLAUDE.md with TDD workflow and versioned branching strategy

## 2025-06-12 - Version 1.3.4

### 🐛 Bug Fixes & Improvements

This release enhances the feedback system with better logging capabilities for improved bug reporting.

### Added

- **Enhanced bug reporting** - Option to include application logs when submitting bug reports
- **Comprehensive log inclusion** - All log levels (debug, info, warn, error) are now included in bug reports for better diagnostics

### Fixed

- **Log level filtering** - Fixed issue where only error logs were being attached to bug reports, now includes all log levels for more comprehensive debugging information

## 2025-05-26 - Version 1.3.0 (PR #76)

### 🎉 Major Release: "Pro" Features & Comprehensive Refactoring

This release represents a significant milestone with extensive refactoring, premium features implementation, and major architectural improvements.

### Added

#### Premium Features & Subscription System

- **Premium subscription system** with Supabase integration
- **GitHub Issues management** functionality with full CRUD operations
- **Push reminder system** with scheduled reminders and notifications
- **Upgrade modal** for premium feature access and subscription management
- **Subscription validation** and downgrade notification features
- **Re-authentication modal** for session management

#### New UI Components & Features

- **File changes detection** and diff viewer with responsive layout
- **Newsletter subscription** feature with MailerLite integration
- **Feedback system** with GitHub integration and smooth UX
- **Branch selection modal** for repository management
- **File preview service** for project file comparison
- **Enhanced confirmation dialogs** for GitHub uploads
- **Analytics tracking** system for user interactions
- **Commit message templates** functionality

#### Testing & Development

- **Comprehensive Jest testing suite** with 154 files changed
- **Unit tests** for FileChangeHandler, GitHubUploadHandler, ComponentLifecycleManager
- **Mock implementations** for Chrome APIs, DOM, and fetch operations
- **Testing reference guide** with best practices
- **Multiple code audit reports** (Cline, Copilot, Cursor, Qodo, Roo, Windsurf)

#### Documentation & Tooling

- **Extension context invalidation fixes** documentation
- **Technical debt** comprehensive documentation
- **Analytics setup** guide
- **Newsletter setup** documentation
- **Husky pre-commit hooks** integration
- **Multiple AI tool configuration** files (.codiumai.toml, .clinerules, .windsurfrules)

### Changed

#### Major Architectural Refactoring

- **Complete UIManager refactoring** with delegation to specialized managers
- **Modular content script architecture** with separation of concerns
- **Service layer restructuring** with interfaces and dependency injection
- **Store management** centralization with Svelte stores
- **Chrome messaging and storage** abstraction layers

#### Enhanced Components

- **DiffViewer component** improved layout responsiveness
- **ProjectsList component** with caching, loading states, and pagination
- **GitHubSettings component** with collapsible sections and improved validation
- **App.svelte** major enhancements for premium features and context handling
- **UploadStatus component** with improved animations and accessibility
- **Notification component** enhanced user interactions

#### Performance & UX Improvements

- **File loading notifications** and force refresh behavior improvements
- **Download handling** with caching support integration
- **Button state management** improvements in GitHub upload workflow
- **Project title handling** refactoring across components
- **Storage quota error handling** in GitHubSettings and App components

### Fixed

- **Extension context invalidation** issues with enhanced error handling
- **Private repository importing** bug resolution
- **File changes modal display** when using "Show Changed Files"
- **Token expiration checks** and refresh logic implementation
- **Project detection** and URL handling improvements

### Technical Improvements

#### New Managers & Services

- `DropdownManager`, `GitHubButtonManager`, `NotificationManager`, `UploadStatusManager`
- `FileChangeHandler`, `GitHubUploadHandler`
- `ComponentLifecycleManager`, `DOMObserver`, `UIElementFactory`
- `OperationStateManager`, `UIStateManager`, `PremiumService`
- `SupabaseAuthService`, `CommitTemplateService`, `PushReminderService`

#### Infrastructure Enhancements

- **Activity monitoring** system implementation
- **Cache service** with idle monitoring functionality
- **File service** abstraction layer
- **Repository service** with comprehensive API coverage
- **Token service** refactoring from GitHubTokenValidator

#### Build & Dependencies

- **Migration from npm to pnpm** (package-lock.json → pnpm-lock.yaml)
- **ESLint configuration** updates
- **Release workflow** improvements
- **Manifest version** updates to support new features

### Breaking Changes

- Removed `BaseGitHubService` and legacy `GitHubTokenValidator` classes
- Significant API changes in UIManager due to refactoring
- Service interface changes for better type safety

### Statistics

- **154 files changed**
- **44,499 insertions**
- **7,208 deletions**
- **Major version bump** to 1.3.0

This release establishes the foundation for premium features while significantly improving code quality, testability, and maintainability.

## 2024-04-20

### Added

- Development guide with commands and code style guidelines
- ZipHandler service for improved file handling
- Enhanced button feedback with permission checking status

### Changed

- Streamlined upload status updates for better performance
- Updated version to 1.2.2 in manifest.json

### Fixed

- Added support for GitHub organization repositories

## 2024-12-02

### Added

- New classes for improved code organization: `BackgroundService`, `StateManager`, `ContentManager`, and `UIManager`.
- UI components for notifications and upload status management.
- Projects tab for managing Bolt projects and GitHub repositories.

### Changed

- Refactored background and content scripts for better modularity and maintainability.
- Enhanced GitHub integration with structured settings and improved error handling.

### Fixed

- Ensured upload status container is appended only after the document body is available, improving UI reliability.
