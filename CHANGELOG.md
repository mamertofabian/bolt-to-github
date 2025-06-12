## 2025-01-06 - Version 1.3.5

### 🎉 New Features

- **Post-installation welcome flow** - Added welcome page with onboarding for new users installing the extension

## 2025-01-06 - Version 1.3.4

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
