# Changelog

## 2026-07-13 - Version 1.3.22

### 🔐 Authentication

- **GitHub App-Only Connection** - A Bolt2GitHub account and GitHub App installation are now required for GitHub features; personal access token support has ended
- **Visible Legacy Migration** - Users with retired credentials receive explicit sign-in and GitHub App connection guidance instead of a silent failure or automatic navigation
- **Preserved Project State** - Existing repository and project mappings are preserved while legacy credential and authentication-selector fields are removed

### 📚 Documentation

- **Current Setup Guidance** - README setup, security, FAQ, troubleshooting, onboarding, and in-app release history now describe the required account plus GitHub App flow
- **Intentional Product Simplification** - Release notes document the retirement decision without claiming that standalone historical usage could be measured

### 🧪 Testing & Quality

- **GitHub App Browser Fixtures** - End-to-end happy paths now establish a Bolt2GitHub session and verified GitHub App installation instead of bypassing readiness with a legacy credential
- **Retirement Guard** - Source checks prevent retired strategy, selector, setup link, analytics, and user-guidance surfaces from returning outside the explicit migration boundary

## 2026-07-13 - Version 1.3.21

### 🐛 Bug Fixes

- **Fresh-Install Login Tab Fix** - Brand-new unauthenticated installs now open only the intended welcome page instead of treating an absent session as an expired session and opening one or more automatic login tabs
- **Recovery Behavior Preserved** - Existing tokens that fail verification still follow the established guided re-authentication path; only the expected no-session onboarding state is passive

### 🧪 Testing & Quality

- **First-Install Regression Coverage** - Public-path auth tests verify that overlapping startup checks keep the extension unauthenticated without creating login tabs, while welcome-page and invalid-session recovery coverage remains green
- **Release Version Contract** - Package metadata, Chrome manifest metadata, changelog, README, and cumulative in-app release notes are checked together for v1.3.21

## 2026-07-12 - Version 1.3.20

### ✨ New Features

- **Post-Push Pro Teaser** - Successful pushes can show a lightweight, rate-limited Pro feature suggestion without interrupting the completed workflow

### 🔧 Performance & Stability

- **Auth Invocation Loop Containment** - GitHub App synchronization no longer manufactures changing installation identities when the backend omits an installation ID, preventing storage recovery from recursively invoking token checks
- **Stable GitHub App Identity** - Successful token responses persist only finite positive server-provided installation IDs; malformed successful responses exit before reporting a false GitHub App success
- **Tab-Aware Reload Guidance** - Auth self-heal reloads notify open Bolt tabs before the extension reloads so users see a durable refresh-to-reconnect message instead of silently losing the injected controls

### 📊 Analytics & Attribution

- **Upgrade Funnel Instrumentation** - Upgrade modal views, CTA clicks, dismissals, and successful checkout launches now carry consistent source and feature context

### 🧪 Testing & Quality

- **Auth Loop Regression Coverage** - Focused tests cover missing, malformed, and valid installation IDs while preserving the v1.3.19 storage-recovery contract
- **Auth Boundary Guard** - A source-boundary test prevents popup and content code from importing the background-owned auth service directly
- **Browser Release Gate Repair** - Lifecycle E2E coverage now uses the current storage schema and popup URL, while obsolete duplicate error scenarios were retired in favor of deterministic product-visible checks

### 📚 Documentation

- **Supabase Function Contract** - Documented the required GitHub App installation ID on successful token responses and the visible degraded path for incomplete connections

## 2026-07-03 - Version 1.3.19

### 🔧 Performance & Stability

- **Auth Self-Healing Execution** - Background-owned auth recovery now schedules self-heal reload alarms and opens guided re-auth tabs directly when privileged Chrome APIs are available, with runtime-message fallbacks only for unprivileged contexts
- **Background Auth Storage Recovery** - The background service worker now watches `chrome.storage.local` auth keys, debounces real token/config changes, forces a Supabase auth check, and rebuilds GitHub push dependencies when auth is restored outside the background context
- **GitHub App Re-auth Preservation** - Transient Supabase session expiry now clears only Supabase session artifacts, preserving `authenticationMethod` and `githubApp*` configuration; explicit user logout still performs the full account/config wipe
- **Single Background Auth Authority** - Popup and content-script auth operations now route through background runtime-message endpoints via `BackgroundAuthClient`, preventing multiple extension contexts from racing the same rotating Supabase refresh token
- **Alarm-Backed Unauthenticated Checks** - Unauthenticated and post-connection auth checks now keep Chrome alarm coverage so recovery can continue across MV3 service worker restarts
- **Orphaned Content-Script Recovery** - Open bolt.new tabs now surface a persistent refresh-to-reconnect notice after extension reload/update/context invalidation instead of leaving the injected UI silently dead

### 📊 Analytics & Attribution

- **Readable Extension Page Titles** - Popup, logs, options, and onboarding page views now report explicit titles (e.g. "Bolt to GitHub - Popup") instead of the generic "Extension Page" bucket, include normalized page paths, and tag every analytics event with `platform: extension`
- **ADC Fix Engagement Tracking** - The "Stuck? Get Expert Help" button now sends an `adc_fix_link_clicked` event, and both it and the Help tab service link carry UTM attribution so extension-driven visits to fix.aidrivencoder.com are measurable

### 🐛 Bug Fixes

- **Repository Error Flows** - Consistent repository-name validation, retryable push errors surfaced in ProjectStatus and FileChangesModal, and GitHubSettings draft fields stay synchronized when project settings change
- **MV3 Message Channel Hardening** - The runtime message listener no longer registers an async handler directly; async response branches return `true` synchronously, rejected async work surfaces through `sendResponse`, and unmatched messages release the response channel
- **Release Validation Noise** - Vite manifest JSON import attributes, validator-visible CRX manifest asset overrides, and a quiet ZIP behavioral regression test
- **E2E Fast Gate Repair** - Browser E2E helpers stay covered by fast Vitest tests while browser-level Playwright commands remain manual release evidence outside the MAID fast gate

### 🧪 Testing & Quality

- **Bolt Toolbar Capture Coverage** - Script-level Vitest coverage for the toolbar DOM snapshot helpers (current Publish-anchored toolbar, legacy `ml-auto` fallback, structured candidate collection), with `scripts/__tests__` now first-class in the shared Vitest config
- **E2E Error-Flow Coverage** - Focused end-to-end tests for invalid repository names and push retry behavior
- **Auth Recovery Coverage** - Added focused coverage for self-heal reload execution, storage-triggered background recovery, session-only cleanup, alarm-backed checks, background auth message routing, popup/content auth clients, runtime import boundaries, and orphaned content-script recovery

### 🛠️ Developer Experience

- **MAID Workflow Onboarding** - Manifest-driven development with plan locks and outcome records now governs extension changes, plus extension maintenance skills and a hardening backlog
- **Auth Lifecycle Manifest Set** - Promoted and completed the auth lifecycle fix/refactor manifest set with outcome records and review notes for the background auth authority migration

## 2026-05-30 - Version 1.3.18

### 🐛 Bug Fixes

- **Restored Push to GitHub Button on May 2026 Bolt DOM** - Bolt moved the top-right Share/Publish toolbar out from under `div.ml-auto`, which meant the extension's button container selector no longer matched and the Push to GitHub button never initialized. Toolbar discovery now keeps the legacy `ml-auto` path for cached tabs and falls back to a Publish/Share anchor for the current Bolt layout.

### 🧪 Testing & Quality

- **Toolbar Regression Tests** - Added tests covering the current `flex 2xl:gap-3 gap-2` toolbar, including Bolt's native "Connect project to GitHub" slot and the classless Publish button wrapper.

### 🛠️ Developer Experience

- **Updated Toolbar Fixture** - Added a captured May 2026 toolbar fixture for future selector recovery work.

## 2026-05-08 - Version 1.3.17

### 🐛 Bug Fixes

- **Restored Download Flow on May 2026 Bolt DOM** - Bolt swapped the project-name dropdown chevron from Lucide (`i-lucide:chevron-down`) to Phosphor (`i-ph:caret-down`), which broke Strategy 1 of `findAndClickExportButton` and surfaced as "Export menu trigger not found". Selectors are now icon-library agnostic and keep working across Lucide, Phosphor, and Heroicons variants
- **Hardened File and Download Icon Matching** - File-archive and download icon detection no longer hard-code a `i-lucide:` prefix, with `arrow-down-tray` (Heroicons) added as a fallback

### 🧪 Testing & Quality

- **May 2026 Bolt DOM Regression Tests** - Added two regression tests pinning the project-name button and download submenu item against the captured `bolt-download-button-v3.html` fixture, so the next icon-library shuffle fails fast in CI

### 🛠️ Developer Experience

- **Two-Step Bolt DOM Capture** - `scripts/capture-bolt-dom.mjs` now captures the toolbar/Publish context and the project-name dropdown plus Export submenu in a single run, feeding both `GitHubButtonManager` and `DownloadService` selector work
- **`fix-bolt-selectors` Skill** - Project-level Claude Code skill that codifies the recovery playbook (capture, diff, branch off `dev-v{NEXT}`, write failing tests, ship library-agnostic selectors), turning future Bolt redesigns from an investigation into a single skill invocation
- **Contributor Guidelines** - Added `AGENTS.md` with repository contributor guidelines

## 2026-04-04 - Version 1.3.16

### 🎉 New Features

- **Commits List Modal (Pro)** - View your commit history directly within the extension with a dedicated modal, including pagination and a link to view the full history on GitHub
- **Editable Project Title & Repository Name** - Rename your project and repository directly from repo settings

### 🔧 Performance & Stability

- **Independent Extension Auth Session** - The extension now mints its own Supabase session, completely decoupled from the bolt2github.com website. Website token rotation, session expiry, or logout no longer break the extension's authentication — the #1 reliability improvement requested by users
- **Commits Modal UX** - Improved modal height, keyboard navigation, and close button behavior

### 🧪 Testing & Quality

- **Independent Session Tests** - 18 tests covering session minting, flag management, cleanup paths, and migration scenarios
- **CommitCard & CommitsService Tests** - Comprehensive component and service test coverage for the commits feature
- **Editable Settings Tests** - Tests for editable project title and repository name

### 🐛 Bug Fixes

- **Repo Rename** - Fixed inability to rename repository in repo settings

## 2026-03-27 - Version 1.3.15

### 🔧 Performance & Stability

- **Supabase Refresh Token Expiration Handling** - Tracks refresh token issuance time to detect 30-day expiration, adds proactive validation before refresh attempts
- **GitHub App Token Validation** - Validates Supabase token expiration in GitHubAppService to prevent cascade failures to GitHub App authentication
- **Auth Lifecycle Recovery for MV3 Service Worker** - Fixed persistent authentication failure after inactivity that required manually toggling the extension off/on to recover:
  - Handle both 401 and 403 responses in token validation (Supabase returns either for expired tokens)
  - Eliminated stale Supabase token caching in GitHubAppService - always reads fresh from storage
  - Proper token precedence: managed supabaseToken (refreshed by SupabaseAuthService) over raw auth-key token
  - Sync-in-progress timeout auto-reset (5min) prevents stuck state after service worker restart
  - Guards against duplicate Chrome event listener registration in auth detection
  - Uses chrome.alarms API for periodic auth checks in authenticated/premium modes so they survive MV3 service worker termination
  - Added auth-periodic-check alarm handler in BackgroundService.setupAlarms

### 🧪 Testing & Quality

- **Comprehensive Test Coverage** - Added extensive tests for auth lifecycle recovery:
  - BackgroundService.auth-lifecycle.test.ts - 235 lines for periodic auth checks and alarm handling
  - SupabaseAuthService.auth-recovery.test.ts - 364 lines for authentication recovery scenarios
  - GitHubAppService.token-validation.test.ts - 116 lines for token validation logic

## 2026-03-08 - Version 1.3.14

### 🎉 New Features

- **Branch Dropdown with Auto-Filtering** - Select or create branches directly from the repo settings with debounced search and filtering
- **Dropdown Toggle** - Clicking the GitHub button while the dropdown is open now properly closes it

### 🔧 Performance & Stability

- **Debounced Branch Loading** - Optimized API calls with smart caching to avoid redundant branch fetches
- **Event Listener Cleanup** - Removed leaked resize/click listeners that accumulated on every dropdown open

### 🐛 Bug Fixes

- **Fixed Button Injection for bolt.new UI Update** - Updated selectors to match bolt.new's changed toolbar container classes (`flex gap-3` → `flex 2xl:gap-3 gap-2`) with fallback for backward compatibility
- **Updated Button Styling** - Migrated from deprecated `bolt-elements-*` to `bolt-ds-*` design tokens to match bolt.new's current design system
- **Removed Forced Style Overrides** - Eliminated injected CSS with `!important` rules that caused button style to revert after clicking
- **Fixed Branch Status Message** - Clarified that new branches are created on first push

## 2025-01-15 - Version 1.3.13

### 🔔 Notification Improvements

- **Fixed Notification Spam** - Eliminated annoying notification spam when Bolt.new tabs are running in the background
- **Smart Rate Limiting** - Notifications now limited to once every 5 minutes to prevent overwhelming users
- **Background Tab Detection** - Extension now detects when tabs are backgrounded and adjusts notification behavior accordingly
- **Persistent Reminder Settings** - Your notification preferences are now saved and survive browser restarts
- **Opt-in Reminders** - Scheduled reminders are now disabled by default for a cleaner experience

### 🔧 Technical Improvements

- **Better Timer Management** - Improved how the extension handles timing to work better with Chrome's background tab throttling
- **State Persistence** - Notification settings and state are now properly saved to browser storage
- **Session Management** - Added 24-hour inactivity reset to keep notifications relevant
- **Queue Management** - Better handling of pending notifications to prevent buildup

### 🧪 Testing & Quality

- **Comprehensive Test Coverage** - Added extensive unit tests for all notification features
- **Edge Case Handling** - Improved handling of various browser states and scenarios

## 2025-10-01 - Version 1.3.12

### 🔧 Performance & Stability

- **Automatic Extension Reload for Auth Failures** - Extension now automatically restarts after 3 consecutive authentication failures to clear stale state and restore connectivity
- **Self-Healing Authentication** - Extension automatically reloads to fix persistent auth failures after 3 consecutive attempts
- **Reliable Service Worker Reloads** - Replaced unreliable setTimeout with chrome.alarms API for Manifest V3 compatibility
- **Persistent Reload Throttling** - Reload timestamp survives extension restarts to prevent reload loops (5-minute minimum)

### 🧪 Testing & Quality

- **Comprehensive Test Coverage** - Added 30 new tests for extension reload functionality (BackgroundService and SupabaseAuthService)
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
