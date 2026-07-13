# Bolt to GitHub - Chrome Extension

<div align="center">
  <a href="https://aidrivencoder.com">
    <img src="assets/icons/icon128.png" alt="AI-Driven Coder" width="128">
  </a>
  <h3>A project by <a href="https://aidrivencoder.com">AI-Driven Coder</a></h3>
  <p>
    <a href="https://bolt2github.com">
      <img src="https://img.shields.io/badge/Website-bolt2github.com-blue" alt="Official Website">
    </a>
    <a href="https://chrome.google.com/webstore/detail/pikdepbilbnnpgdkdaaoeekgflljmame">
      <img src="https://img.shields.io/chrome-web-store/v/pikdepbilbnnpgdkdaaoeekgflljmame" alt="Chrome Web Store">
    </a>
    <a href="https://github.com/mamertofabian/bolt-to-github/blob/main/LICENSE">
      <img src="https://img.shields.io/github/license/mamertofabian/bolt-to-github" alt="License">
    </a>
    <a href="https://youtube.com/@aidrivencoder">
      <img src="https://img.shields.io/badge/YouTube-Subscribe-red" alt="YouTube">
    </a>
  </p>
</div>

A Chrome extension that automatically captures ZIP file downloads from bolt.new, extracts them, and pushes the contents to a specified GitHub repository. Built with Svelte, TypeScript, and TailwindCSS. Visit our official website at [bolt2github.com](https://bolt2github.com) for more information, tutorials, and resources.

## 📦 Installation Options

### Stable Version (Chrome Web Store)

<a href="https://chrome.google.com/webstore/detail/pikdepbilbnnpgdkdaaoeekgflljmame">
  <img src="https://img.shields.io/badge/Install%20from-Chrome%20Web%20Store-blue?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Install from Chrome Web Store" height="40">
</a>

### Latest Version: v1.3.22

#### Version 1.3.22 - GitHub App-Only Authentication (July 2026)

**What's new:**

- Personal access token support has ended
- A Bolt2GitHub account and GitHub App connection are now required for GitHub features
- Existing repository and project mappings are preserved during the required migration
- Legacy credentials are removed locally and the extension shows the exact reconnection steps

**How to migrate:**

1. Open the extension and select **Connect GitHub Account**
2. Sign in to your Bolt2GitHub account
3. Install or reconnect the GitHub App and choose the repositories it may access
4. Return to the extension; your preserved repository mappings will be ready to use

This is an intentional product simplification after the GitHub App has been the recommended setup
for more than a year. Historical standalone usage cannot be measured reliably, so this release does
not make claims about how many people used the retired path.

### Previous Version: v1.3.21

#### Version 1.3.21 - Cleaner First-Install Onboarding (July 2026)

**What's new:**

- New extension installs open only the welcome page instead of also opening automatic login tabs
- Empty sessions are treated as the expected onboarding state rather than an expired login
- Existing invalid or expired sessions still keep their guided recovery behavior

**Key Benefits:**

- Cleaner first-run experience with no duplicate, focus-stealing login tabs
- Sign-in starts from the welcome flow or another explicit user action
- Established authentication recovery remains available when a real session fails

### Previous Version: v1.3.20

#### Version 1.3.20 - Auth Containment & Post-Push Guidance (July 2026)

**What's new:**

- Fixed a GitHub App retry loop that could repeatedly check incomplete connections in the background
- Incomplete GitHub App installation details no longer cause repeated background token checks
- Open Bolt tabs now receive refresh guidance before an authentication self-heal reload
- Successful pushes can show a lightweight suggestion for a relevant Pro feature

**Key Benefits:**

- Far fewer unnecessary background authentication requests
- Background authentication traffic remains bounded when installation details are incomplete
- Extension reload recovery is clearer on tabs that need a refresh
- Pro discovery happens after a successful push without interrupting the workflow

### Previous Version: v1.3.19

#### Version 1.3.19 - Auth Recovery & Reliability (July 2026)

**What's new:**

- Clearer push errors with a retry option instead of failing silently
- More reliable auth recovery after stale sign-ins or extension reloads, without a manual disable/enable cycle
- GitHub App connections survive normal re-authentication instead of forcing a full reconnect
- Consistent repository name validation before a push can fail
- Reconnect notices on open Bolt tabs when an extension reload or update leaves the injected UI disconnected

**Key Benefits:**

- Push failures are actionable: you see what went wrong and can retry immediately
- Background auth recovery keeps working across MV3 service worker restarts
- GitHub App setup is preserved through transient session expiry
- Orphaned tabs tell you exactly when a page refresh is needed to reconnect

### Previous Version: v1.3.18

#### Version 1.3.18 - Push Button Recovery (May 2026)

**What's new:**

- Restored the Push to GitHub button after Bolt moved the Share/Publish toolbar
- Toolbar detection now supports both legacy `ml-auto` layouts and the current Publish/Share anchored layout
- Added regression tests for the current May 2026 toolbar structure

**Key Benefits:**

- Push to GitHub appears again on current bolt.new project pages
- Cached or older Bolt tabs remain supported through legacy selector fallbacks
- Future toolbar changes are easier to diagnose with a dedicated fixture

### Previous Version: v1.3.17

#### Version 1.3.17 - Bolt DOM Recovery (May 2026)

**What's new:**

- Restored download/export flow after Bolt swapped the dropdown chevron from Lucide to Phosphor
- Icon-library agnostic selectors that work across Lucide, Phosphor, and Heroicons
- Regression tests pinned against the May 2026 Bolt DOM
- New `fix-bolt-selectors` recovery skill and two-step DOM capture script

**Key Benefits:**

- Download button keeps working through Bolt's icon library reshuffles
- Future Bolt redesigns get fixed in minutes instead of hours
- Failing tests catch the next selector regression before it ships

### Previous Version: v1.3.16

#### 📝 Version 1.3.16

**What's new:**

- Independent extension auth session decoupled from bolt2github.com
- Commits List Modal (Pro) with pagination and GitHub link
- Editable project title and repository name from repo settings
- Fixed inability to rename repository

**Key Benefits:**

- Auth no longer breaks when the website session rotates or expires
- Browse and audit your commit history without leaving the extension
- Rename projects and repos in place

### Previous Version: v1.3.15

#### 📝 Version 1.3.15 – Auth Lifecycle Recovery

**What's new:**

- Supabase refresh token 30-day expiration handling
- GitHub App token validation with Supabase token expiry checks
- Comprehensive auth lifecycle recovery for MV3 service worker
- Handles both 401 and 403 responses for expired tokens
- Chrome alarms API for periodic auth checks surviving service worker termination
- Sync-in-progress timeout auto-reset (5min) prevents stuck state

**Key Benefits:**

- No more persistent auth failures after inactivity
- No need to manually toggle the extension off/on to recover
- Proactive token validation before refresh attempts
- Robust auth state management across service worker restarts

### Previous Version: v1.3.14

#### 📝 Version 1.3.14 – Branch Dropdown & bolt.new UI Fix

**What's new:**

- Branch dropdown with auto-filtering in repo settings
- Fixed button injection for bolt.new's updated UI
- Dropdown toggle and updated button styling

**Key Benefits:**

- Select or create branches directly from the extension
- Seamless integration with bolt.new's latest design
- Cleaner UI with proper dropdown toggle behavior

### Previous Version: v1.3.13

#### 📝 Version 1.3.13 – Notification Spam Fix

**What's new:**

- **Fixed Notification Spam** – No more annoying notification spam when Bolt.new tabs are in the background
- **Smart Rate Limiting** – Notifications limited to once every 5 minutes to prevent overwhelming users
- **Background Tab Detection** – Extension detects when tabs are backgrounded and adjusts behavior accordingly
- **Persistent Settings** – Your notification preferences are saved and survive browser restarts
- **Opt-in Reminders** – Scheduled reminders disabled by default for a cleaner experience

**Key Benefits:**

- **No More Notification Spam** – Clean, distraction-free experience when working with background tabs
- **Smart Rate Limiting** – Prevents overwhelming users with too many notifications
- **Persistent Preferences** – Your settings are remembered across browser sessions
- **Better Default Experience** – Reminders are opt-in, reducing notification fatigue

### Previous Version: v1.3.12

#### 📝 Version 1.3.12 – Enhanced Auth Recovery

**What's new:**

- **Auto-Recovery from Auth Expiry** – Extension automatically reloads to fix persistent authentication issues
- **Manifest V3 Optimization** – Reliable service worker reloads using chrome.alarms API instead of setTimeout
- **Enhanced Stability** – Persistent reload throttling prevents loops (5-minute minimum between reloads)
- **Improved Testing** – 30+ new tests ensure robust authentication recovery

**Key Benefits:**

- **No More Manual Restarts** – Automatically recovers from auth failures without user intervention
- **Reliable in All Scenarios** – Works even when service worker becomes inactive (Manifest V3 fix)
- **Smart Self-Healing** – Reloads only when necessary after 3 consecutive auth failures

#### 📝 Version 1.3.11 – New Bolt.new Design Integration

**What's new:**

- **Updated for New Bolt.new Design** – Seamless integration with the latest UI changes
- **Fixed GitHub Button Injection** – Now works with the new header layout structure
- **Enhanced Download Functionality** – Updated to work with project name dropdown export flow
- **Eliminated Color Flash** – Button appears with correct styling immediately
- **Improved Button Placement** – Smart targeting of GitHub button container

**Key Benefits:**

- **Seamless Integration** – Works perfectly with Bolt.new's updated design
- **Reliable Downloads** – Export functionality works with the new dropdown structure
- **Better UX** – No more color flashing or visual glitches
- **Future-Proof** – Robust selectors that adapt to UI changes

#### 📝 Version 1.3.10 – Bolt.new Header Integration Fix

**What's new:**

- **Bolt.new Header Integration Fix** – Updated to work with bolt.new's new header layout
- **Enhanced Re-authentication Flow** – Improved authentication handling and user guidance
- **Export Button Detection Update** – Fixed export/download functionality with new bolt.new structure

**Key Benefits:**

- **Seamless Integration** – GitHub button injection works perfectly with updated bolt.new header
- **Reliable Downloads** – Export → Download functionality restored and working reliably
- **Better User Experience** – Improved authentication flow with clearer guidance during token issues
- **Future-Proof** – Maintains backward compatibility while supporting new bolt.new features

### Previous Version: v1.3.9

#### 📝 Version 1.3.9 – Pop-out Window Release

**What's new:**

- **Pop-out window mode** – Keep the extension open in its own dedicated window that never closes when you click away.

### Previous Version: v1.3.8

#### 📝 Version 1.3.8 – Quick Fix Release

**What’s new:**

- **Works with Bolt’s new 3-dots Export menu** – seamless Export → Download interception again.
- **Lighter on resources** – background observers use less CPU.
- **More resilient** – graceful errors and self-recovery if something goes wrong.

### Version 1.3.7

#### 📝 Version 1.3.7 - Automatic README Generation

**Major Features:**

- **Automatic README Generation** - Smart documentation creation for projects without meaningful README files
- **Smart Content Detection** - Preserves existing documentation while replacing empty or whitespace-only files
- **Zero Setup Required** - Works automatically during push to GitHub with no configuration needed

**Key Benefits:**

- **Never push undocumented projects** - Automatic README creation ensures every project has meaningful documentation
- **Intelligent detection** - Handles README, readme, Readme file variations with case-insensitive detection
- **Content preservation** - Existing meaningful documentation is always preserved
- **Project branding** - Generated READMEs include project name and Bolt to GitHub attribution

#### 🔄 Version 1.3.6 - Project Synchronization & Stability

**Major Features:**

- **Automatic Project Sync** - Your Bolt projects now sync automatically across devices and browsers
- **Data Loss Prevention** - Fixed critical race conditions that could cause project data loss
- **Enhanced Reliability** - Comprehensive improvements to storage operations and error handling

**Key Benefits:**

- **Never lose your projects** - Seamless synchronization ensures your project mappings are always available
- **Cross-device compatibility** - Access your projects from any browser or device
- **Automatic conflict resolution** - Smart handling of sync conflicts with multiple resolution strategies
- **Background sync** - Periodic 5-minute automatic syncing keeps everything up-to-date

#### 🐛 Version 1.3.4 - Enhanced Bug Reporting

**Bug Fixes & Improvements:**

- **Enhanced bug reporting** - Added option to include application logs when submitting bug reports
- **Added What's New** - Added a What's New modal to show the latest highlights of the new version

#### 🎉 Version 1.3.2 - GitHub App Introduction

**Major Authentication Enhancement:**

- **GitHub App Authentication** - Introduced scoped repository access through GitHub App installations
- **Automatic Configuration** - GitHub App users get automatic repository owner detection
- **Enhanced Security** - Short-lived tokens with fine-grained permissions through GitHub Apps

**Technical Implementation:**

- **UnifiedGitHubService** - Introduced the service architecture that powered the GitHub App rollout
- **95% Migration Complete** - Core functionality fully migrated with minor cleanup remaining
- **Clean Architecture** - Removed circular dependencies and improved modularity
- **Comprehensive Testing** - All tests updated to support new authentication architecture

#### Version 1.3.0 - Major "Pro" Features Release

**Premium Features & Enhanced Functionality:**

- **Premium subscription system** with advanced features and Supabase integration
- **GitHub Issues management** - Create, view, edit, and manage GitHub issues directly from the extension
- **Push reminder system** - Scheduled reminders and notifications for your projects
- **File changes detection** - Advanced diff viewer to see what's changed before pushing
- **Newsletter subscription** - Stay updated with latest features and tips
- **Enhanced feedback system** - Improved GitHub integration for bug reports and feature requests
- **Branch selection modal** - Better repository management with branch switching
- **Commit message templates** - Predefined templates for consistent commit messages
- **Analytics tracking** - Better understanding of usage patterns for improvements

**Technical Improvements:**

- **Complete architecture refactoring** - Modular content script architecture with specialized managers
- **Comprehensive testing suite** - 154 files with Jest unit tests and mock implementations
- **Enhanced performance** - Better file loading, caching, and state management
- **Migration to pnpm** - Improved package management and faster builds
- **Premium authentication** - Re-authentication modal and session management

**Developer Experience:**

- **Enhanced documentation** - Technical debt documentation, testing guides, and setup instructions
- **Multiple AI tool integrations** - Configuration files for Cline, Copilot, Cursor, Qodo, and Windsurf
- **Husky pre-commit hooks** - Automated code quality checks
- **Service layer restructuring** - Better interfaces and dependency injection

#### 🚀 Current Stable Features (v1.2.3)

- Add Push to GitHub button in Settings popup
- Enhanced UI with better positioning and responsiveness
- GitHub dropdown menu with accessibility enhancements
- Project organization features (grouping by type: Bolt and GitHub)
- Project deletion functionality
- Repository settings management improvements
- Help button with improved resources and links to official website
- Improvements in temporary repository clean up

#### 🛠️ Added in v1.2.2

- Support for GitHub organization repositories
- Enhanced button feedback with permission checking status
- ZipHandler service for better file processing
- Development guide with commands and code style guidelines

#### 🔒 Added in v1.2.1

- Support for Private GitHub repositories (see demo here: https://youtu.be/d9NqXRoroi0)
- Enhanced GitHub integration with token validation
- Improved repository management and temporary repository handling
- New user interface components:
  - Help system and New User Guide
  - Project Status dashboard
  - Modal system for better interactions
- Robust error handling and rate limit management
- Task queue system for better performance
- Enhanced code quality with strict TypeScript standards

#### Existing Features

- 🚀 Automatic ZIP file interception from bolt.new
- 📦 In-browser ZIP file extraction
- 🔄 Direct GitHub repository integration
- 🔒 Secure credential storage
- ⚡ Real-time processing status updates
- 🎨 Clean, responsive UI with shadcn-svelte components
- 📱 Modern, accessible interface
- 🔄 Upload progress tracking
- 🎯 Custom upload status alerts
- ✨ Multi-repository support
- 📄 Follow `.gitignore` rules for file uploads
- ⚙️ Repo settings displayed in popup
- ✉️ Custom commit messages
- 💾 Automatically save new project settings
- 📋 Projects tab with quick access to all your Bolt projects:
  - View all pushed projects in one place
  - Open projects directly in Bolt
  - Access GitHub repositories
  - Import existing GitHub repos into Bolt

#### Best Practices

1. Always verify your repository settings before syncing a new project
2. Double-check the repository name and branch when switching between projects

### Latest Version (GitHub)

To try the latest development version:

1. Clone and install:

   ```bash
   git clone https://github.com/mamertofabian/bolt-to-github.git
   cd bolt-to-github

   # Install using pnpm (recommended) - faster and more efficient
   pnpm install

   # Or using npm if you prefer
   npm install
   ```

2. Build the extension:

   ```bash
   pnpm run build
   ```

3. Load in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist` directory from your project folder

> **Note**: The GitHub version contains the latest features but may be less stable than the Chrome Web Store version.

---

## Supported Browsers

- Chrome
- Brave

## Installation

### 👉 For Users

Get started in just 3 simple steps:

1. **Install from Chrome Web Store**
   - Visit our [Chrome Web Store page](https://chrome.google.com/webstore/detail/pikdepbilbnnpgdkdaaoeekgflljmame)
   - Click "Add to Chrome"
   - Click "Add extension" when prompted

2. **Configure the Extension**
   - Make sure you have a Bolt.new project loaded
   - Click the extension icon in your Chrome toolbar
   - Sign in to your **Bolt2GitHub account**
   - Connect the **GitHub App** and choose the repositories Bolt to GitHub may access
   - Enter the following details:
     - Repository Owner (auto-filled from the GitHub App)
     - Repository Name
     - Branch Name (defaults to 'main')
   - Save your settings and you're ready to go!

3. **Load your Bolt.new Project**
   - Click on the GitHub button in the Bolt.new project page at the top right
   - Confirm the popup that appears
   - Done!

### 🚨 New to GitHub?

Follow these steps to get started:

1. [Create a GitHub account](https://github.com/join)
2. [Create or sign in to your Bolt2GitHub account](https://bolt2github.com)
3. Open the extension and connect the GitHub App to the repositories you want to use

### 🛠️ For Developers (Contributing)

If you want to modify the extension or contribute to its development:

1. Set up your development environment:

   ```bash
   # Make sure you have Node.js v18 or later installed (v22 LTS recommended)
   node --version
   ```

2. Clone and install:

   ```bash
   git clone https://github.com/mamertofabian/bolt-to-github.git
   cd bolt-to-github

   # This project uses pnpm for better performance and disk efficiency
   pnpm install
   ```

3. Build for development:

   ```bash
   # Development with hot reload
   pnpm run watch

   # Production build
   pnpm run build

   # Run tests (v1.3.0+)
   pnpm test

   # Lint code
   pnpm run lint

   # Format code
   pnpm run format
   ```

4. Set up environment variables:

   ```bash
   # Copy the example environment file
   cp .env.example .env

   # Edit .env and add your Google Analytics API secret
   # Get it from: https://analytics.google.com/analytics/web/
   # Navigate to: Admin > Data Streams > [Your Stream] > Measurement Protocol API secrets
   ```

5. Load in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist` directory from your project folder

#### Environment Variables

The extension uses environment variables for sensitive configuration:

- `VITE_GA4_API_SECRET`: Google Analytics 4 API secret for analytics tracking
  - Required for analytics functionality
  - Analytics will be disabled if not provided
  - Never commit this value to the repository

#### Adding UI Components (shadcn-svelte)

This project uses [shadcn-svelte](https://www.shadcn-svelte.com/) for UI components. To add new components:

```bash
# Use the shadcn-svelte CLI (not the regular shadcn CLI)
pnpm dlx shadcn-svelte@latest add [component-name]

# Examples:
pnpm dlx shadcn-svelte@latest add button
pnpm dlx shadcn-svelte@latest add card
pnpm dlx shadcn-svelte@latest add dialog
```

**Important**: Always use `shadcn-svelte@latest` (not `shadcn@latest`) as this project uses the Svelte variant.

The components will be automatically added to `src/lib/components/ui/` and can be imported like:

```svelte
<script>
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
</script>
```

See our [Contributing Guide](#contributing) for more details.

## Project Structure

```
.
├── assets/                # Extension icons and assets
│   └── icons/            # Extension icons in various sizes
├── src/
│   ├── background/      # Extension background service
│   │   └── __tests__/   # Background service tests
│   ├── content/         # Content scripts with modular architecture
│   │   ├── __tests__/   # Content script tests
│   │   ├── handlers/    # Event and action handlers
│   │   ├── infrastructure/ # Core infrastructure services
│   │   ├── managers/    # Specialized UI and state managers
│   │   ├── services/    # Content-specific services
│   │   └── types/       # Content script type definitions
│   ├── lib/             # Core library and utilities
│   │   ├── __tests__/   # Library tests
│   │   ├── components/  # Reusable UI components
│   │   │   ├── ui/      # shadcn-svelte UI components
│   │   │   │   ├── alert/
│   │   │   │   ├── badge/
│   │   │   │   ├── button/
│   │   │   │   ├── card/
│   │   │   │   ├── dialog/
│   │   │   │   ├── input/
│   │   │   │   ├── label/
│   │   │   │   ├── modal/
│   │   │   │   └── tabs/
│   │   │   ├── github/  # GitHub-specific components
│   │   │   ├── EnhancedGitHubSettings.svelte
│   │   │   ├── Footer.svelte
│   │   │   ├── GitHubSettings.svelte
│   │   │   ├── Header.svelte
│   │   │   ├── NotBoltSite.svelte
│   │   │   ├── SocialLinks.svelte
│   │   │   ├── StatusAlert.svelte
│   │   │   └── UploadProgress.svelte
│   │   ├── constants/   # Application constants
│   │   ├── services/    # Core services (GitHub, storage, etc.)
│   │   ├── stores/      # Svelte stores for state management
│   │   └── utils/       # Utility functions
│   ├── popup/           # Extension popup UI
│   │   ├── components/  # Popup-specific components
│   │   ├── App.svelte   # Main popup component
│   │   ├── index.html   # Popup HTML template
│   │   └── main.ts      # Popup entry point
│   ├── services/        # Service modules
│   │   ├── __tests__/   # Service tests
│   │   ├── interfaces/  # Service interfaces
│   │   ├── types/       # Service type definitions
│   │   ├── GitHubAppService.ts      # GitHub App authentication
│   │   ├── UnifiedGitHubService.ts  # Unified authentication service
│   │   ├── PremiumService.ts        # Premium features service
│   │   ├── SupabaseAuthService.ts   # Supabase integration
│   │   └── [other services]
│   ├── styles/          # Global styles
│   ├── test/            # Test setup and utilities
│   │   └── setup/       # Test configuration
│   └── types/           # TypeScript type definitions
├── manifest.json         # Chrome extension manifest
├── package.json         # Project dependencies and scripts
├── tailwind.config.js   # TailwindCSS configuration
├── tsconfig.json        # TypeScript configuration
└── vite.config.ts       # Vite build configuration
```

## Tech Stack

### Core Technologies

- [Svelte](https://svelte.dev/) - UI framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Vite](https://vitejs.dev/) - Build tool
- [TailwindCSS](https://tailwindcss.com/) - Styling
- [shadcn-svelte](https://www.shadcn-svelte.com/) - UI components
- [fflate](https://github.com/101arrowz/fflate) - Zip file processing

### Premium Features (v1.3.0+)

- [Supabase](https://supabase.com/) - Backend services and authentication
- [MailerLite](https://mailerlite.com/) - Newsletter management
- [Vitest](https://vitest.dev/) - Testing framework

### Development Tools

- [pnpm](https://pnpm.io/) - Package manager
- [ESLint](https://eslint.org/) - Code linting
- [Prettier](https://prettier.io/) - Code formatting
- [Husky](https://typicode.github.io/husky/) - Git hooks

## Security

- **Required GitHub App integration**: Scoped repository access with short-lived credentials and fine-grained permissions
- **Bolt2GitHub account boundary**: GitHub actions require a signed-in Bolt2GitHub session
- **Automatic token management**: GitHub App tokens are automatically refreshed when needed
- **Short-lived credential storage**: GitHub App credentials are renewed automatically and stored in Chrome's extension storage
- **HTTPS communication**: All communication with GitHub uses HTTPS
- **Browser-only processing**: ZIP file processing happens entirely in the browser
- **Premium authentication**: Enhanced security with Supabase integration (v1.3.0+)
- **Zero credential exposure**: No tokens or credentials are ever logged or exposed

## Support & Resources

### Documentation & Tutorials

- 🌐 [Official Website](https://bolt2github.com)
- 📺 [Watch our video tutorials](https://youtube.com/@aidrivencoder)
- 📖 [Read the documentation](https://github.com/mamertofabian/bolt-to-github)
- 🔧 [Bolt2GitHub account and GitHub App setup](https://bolt2github.com) - Required connection and repository access
- 📋 [Technical Documentation](TECHNICAL_DEBT.md) - Architecture and implementation details
- 🧪 [Testing Reference](TESTING_REFERENCE.md) - Testing guidelines and best practices
- 💡 [Get development tips](https://aidrivencoder.com)
- 💬 [Discord Community](https://discord.gg/JtjYHBBnGU)

### Professional Support

- 📊 [Book a consultation](https://calendly.com/mamerto/30min)
- 📧 [Email support](mailto:mamerto@codefrost.com)
- 💻 [Custom development inquiries](https://codefrost.com)

### Report Issues & Send Feedback

For bugs or feature requests, you have multiple convenient options:

#### Built-in Feedback System 🚀

- Click the extension icon and go to the "Help" tab
- Click the "Send Feedback" button for an easy-to-use feedback form
- **Works for everyone**: Whether you're authenticated with GitHub or not!
- **Smart fallback**: If you're not logged in, the system will guide you to submit feedback directly on GitHub with pre-filled content

#### Direct GitHub Issues

- [Open an issue](https://github.com/mamertofabian/bolt-to-github/issues) directly on the GitHub repository
- Perfect for detailed bug reports or feature requests

#### Quick Feedback Categories

- 💝 **Appreciation**: Share what you love about the extension
- ❓ **Questions**: Ask for help or clarification
- 🐛 **Bug Reports**: Report issues or unexpected behavior
- ✨ **Feature Requests**: Suggest new features or improvements
- 💬 **General Feedback**: Any other thoughts or suggestions

### Support the Project

If you find this extension helpful, you can support its development:

[![Buy Me A Coffee](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/aidrivencoder)

Your support helps maintain and improve this extension!

## Contributing

1. Fork the repository
2. Create a feature branch

```bash
git checkout -b feature/my-new-feature
```

3. Commit your changes

```bash
git commit -am 'Add some feature'
```

4. Push to the branch

```bash
git push origin feature/my-new-feature
```

5. Create a Pull Request

## License

MIT License - see [LICENSE](LICENSE) file for details

## Permissions

This extension requires the following permissions:

- `webRequest`: To intercept downloads
- `downloads`: To manage downloads
- `storage`: To store settings
- `scripting`: To interact with bolt.new

## FAQ

**Q: Why do I need a Bolt2GitHub account and the GitHub App?**

A: The account establishes your extension session, while the GitHub App grants scoped access to the repositories you choose.

**Q: What happens when GitHub App access expires?**

A: The extension renews its short-lived GitHub App credentials automatically. If the account or installation is disconnected, the extension shows reconnection guidance instead of attempting a push.

**Q: Can I specify which files to push to GitHub?**  
A: Currently, the extension processes all files in the ZIP. File filtering may be added in future versions.

## Troubleshooting

### Common Issues

1. **Extension not intercepting downloads**
   - Ensure you're on bolt.new
   - Check if the file is a ZIP
   - Verify permissions are enabled

2. **GitHub push fails**
   - Confirm you are signed in to your Bolt2GitHub account
   - Confirm the GitHub App is installed for the target repository
   - Check repository name and owner
   - Ensure branch exists

3. **The extension says GitHub authentication has changed**
   - Follow the sign-in and GitHub App connection steps shown in the extension
   - Your existing repository and project mappings are preserved during migration

4. **ZIP processing errors**
   - Check if the ZIP file is corrupted
   - Ensure file contents are text-based

## Future Enhancements

- Let me know if you have any ideas for additional features or improvements by opening an issue on GitHub.

## Acknowledgments

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Svelte Documentation](https://svelte.dev/docs)
- [GitHub API Documentation](https://docs.github.com/en/rest)
- [shadcn-svelte](https://www.shadcn-svelte.com/)

---

<div align="center">
  <p>
    Created by <a href="https://aidrivencoder.com">AI-Driven Coder</a> | 
    Powered by <a href="https://codefrost.com">Codefrost</a> |
    Maintained by <a href="https://github.com/mamertofabian">Mamerto Fabian</a>
  </p>
  <p>
    <a href="https://youtube.com/@aidrivencoder">YouTube</a> •
    <a href="https://aidrivencoder.com">Website</a> •
    <a href="https://github.com/aidrivencoder">GitHub</a>
  </p>
</div>

## Project Features

### Projects Management

The extension includes a dedicated Projects tab that helps you:

- Keep track of all your Bolt projects pushed to GitHub
- Quick-access buttons to:
  - Open projects directly in Bolt
  - View repositories on GitHub
  - Import repositories back into Bolt
- View branch information and project details at a glance
