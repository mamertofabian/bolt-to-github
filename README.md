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

### Latest Version: v1.3.7 (Development)

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

#### 🎉 Version 1.3.2 - GitHub App Authentication Support

**Major Authentication Enhancement:**

- **GitHub App Authentication** - Modern, secure authentication method as an alternative to Personal Access Tokens
- **Dual Authentication Support** - Seamlessly supports both PAT and GitHub App authentication
- **Automatic Configuration** - GitHub App users get automatic repository owner detection
- **Enhanced Security** - Short-lived tokens with fine-grained permissions through GitHub Apps
- **Zero Breaking Changes** - Existing PAT users continue to work without any modifications

**Technical Implementation:**

- **UnifiedGitHubService** - New service architecture supporting multiple authentication methods
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
   - Choose your authentication method:
     - **GitHub App** (Recommended): Sign in through bolt2github.com for enhanced security
     - **Personal Access Token**: Enter your GitHub token (needs repo permissions)
   - Enter the following details:
     - Repository Owner (auto-filled for GitHub App users)
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
2. [Generate a personal access token](https://github.com/settings/tokens/new?scopes=repo&description=Bolt%20to%20GitHub) (needs repo permissions)

Need help? Watch our [Quick Start Video Tutorial](https://youtu.be/7C03DNw9ZHI)

### 🛠️ For Developers (Contributing)

If you want to modify the extension or contribute to its development:

1. Set up your development environment:

   ```bash
   # Make sure you have Node.js v16 or later installed
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
- [Jest](https://jestjs.io/) - Testing framework

### Development Tools

- [pnpm](https://pnpm.io/) - Package manager
- [ESLint](https://eslint.org/) - Code linting
- [Prettier](https://prettier.io/) - Code formatting
- [Husky](https://typicode.github.io/husky/) - Git hooks

## Security

- **Multiple authentication methods**: Full support for both Personal Access Tokens and GitHub Apps (v1.3.2+)
- **GitHub Apps integration**: More secure authentication with short-lived tokens and fine-grained permissions
- **Automatic token management**: GitHub App tokens are automatically refreshed when needed
- **Secure token storage**: All credentials are stored securely using Chrome's storage API
- **HTTPS communication**: All communication with GitHub uses HTTPS
- **Browser-only processing**: ZIP file processing happens entirely in the browser
- **Premium authentication**: Enhanced security with Supabase integration (v1.3.0+)
- **Zero credential exposure**: No tokens or credentials are ever logged or exposed

## Support & Resources

### Documentation & Tutorials

- 🌐 [Official Website](https://bolt2github.com)
- 📺 [Watch our video tutorials](https://youtube.com/@aidrivencoder)
- 📖 [Read the documentation](https://github.com/mamertofabian/bolt-to-github)
- 🔧 [GitHub Apps Migration Guide](GITHUB_APPS_MIGRATION_GUIDE.md) - Modern authentication alternative to PATs
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

**Q: Why does the extension need a GitHub token?**  
A: The token is required to authenticate with GitHub's API for pushing files to your repository.

**Q: Is my GitHub token secure?**  
A: Yes, your token is stored securely in Chrome's storage system and is only used for GitHub API calls.

**Q: Can I specify which files to push to GitHub?**  
A: Currently, the extension processes all files in the ZIP. File filtering may be added in future versions.

## Troubleshooting

### Common Issues

1. **Extension not intercepting downloads**

   - Ensure you're on bolt.new
   - Check if the file is a ZIP
   - Verify permissions are enabled

2. **GitHub push fails**

   - Verify your token has repo permissions
   - Check repository name and owner
   - Ensure branch exists

3. **ZIP processing errors**
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
