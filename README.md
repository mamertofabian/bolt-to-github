# Bolt to GitHub - Chrome Extension

<div align="center">
  <a href="https://aidrivencoder.com">
    <img src="assets/icons/icon128.png" alt="AI-Driven Coder" width="128">
  </a>
  <h3>A project by <a href="https://aidrivencoder.com">AI-Driven Coder</a></h3>
  <p>
    <a href="https://chrome.google.com/webstore/detail/pikdepbilbnnpgdkdaaoeekgflljmame">
      <img src="https://img.shields.io/chrome-web-store/v/pikdepbilbnnpgdkdaaoeekgflljmame" alt="Chrome Web Store">
    </a>
    <a href="https://github.com/mamertofabian/bolt-to-gitlab/blob/main/LICENSE">
      <img src="https://img.shields.io/github/license/mamertofabian/bolt-to-gitlab" alt="License">
    </a>
    <a href="https://youtube.com/@aidrivencoder">
      <img src="https://img.shields.io/badge/YouTube-Subscribe-red" alt="YouTube">
    </a>
  </p>
</div>

A Chrome extension that automatically captures ZIP file downloads from bolt.new, extracts them, and pushes the contents to a specified GitHub repository. Built with Svelte, TypeScript, and TailwindCSS.

## 📦 Installation Options

### Stable Version (Chrome Web Store)

<a href="https://chrome.google.com/webstore/detail/pikdepbilbnnpgdkdaaoeekgflljmame">
  <img src="https://img.shields.io/badge/Install%20from-Chrome%20Web%20Store-blue?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Install from Chrome Web Store" height="40">
</a>

### Latest stable version (v1.2.1) includes the following features:

#### 🔒 New in v1.2.1

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
  git clone https://github.com/mamertofabian/bolt-to-gitlab.git
  cd bolt-to-gitlab
   npm install
   ```

2. Build the extension:

   ```bash
   npm run build
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
   - Enter your GitHub token (needs repo permissions)
   - Repository Owner
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
  git clone https://github.com/mamertofabian/bolt-to-gitlab.git
  cd bolt-to-gitlab
   npm install
   ```

3. Build for development:

   ```bash
   npm run watch   # For development with hot reload
   # OR
   npm run build  # For production build
   ```

4. Load in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist` directory from your project folder

See our [Contributing Guide](#contributing) for more details.

## Project Structure

```
.
├── assets/                # Extension icons and assets
│   └── icons/            # Extension icons in various sizes
├── src/
│   ├── background.ts     # Extension background service
│   ├── content/          # Content scripts
│   │   ├── upload-status.ts
│   │   └── UploadStatus.svelte
│   ├── lib/             # Core library and utilities
│   │   ├── common.ts    # Common utilities
│   │   ├── constants.ts # Application constants
│   │   ├── github.ts    # GitHub API integration
│   │   ├── utils.ts     # Utility functions
│   │   ├── zip.ts       # ZIP file processing
│   │   └── components/  # Reusable UI components
│   │       ├── ui/      # shadcn-svelte UI components
│   │       ├── Footer.svelte
│   │       ├── GitHubSettings.svelte
│   │       ├── Header.svelte
│   │       ├── NotBoltSite.svelte
│   │       ├── SocialLinks.svelte
│   │       ├── StatusAlert.svelte
│   │       └── UploadProgress.svelte
│   ├── popup/           # Extension popup UI
│   │   ├── App.svelte   # Main popup component
│   │   ├── index.html   # Popup HTML template
│   │   └── main.ts      # Popup entry point
│   ├── services/        # Service modules
│   │   ├── buttonInjector.ts
│   │   └── zipHandler.ts
│   ├── styles/          # Global styles
│   └── types/           # TypeScript type definitions
├── manifest.json         # Chrome extension manifest
├── package.json         # Project dependencies and scripts
├── tailwind.config.js   # TailwindCSS configuration
├── tsconfig.json        # TypeScript configuration
└── vite.config.ts       # Vite build configuration
```

## Tech Stack

- [Svelte](https://svelte.dev/) - UI framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Vite](https://vitejs.dev/) - Build tool
- [TailwindCSS](https://tailwindcss.com/) - Styling
- [shadcn-svelte](https://www.shadcn-svelte.com/) - UI components
- [fflate](https://github.com/101arrowz/fflate) - Zip file processing

## Security

- GitHub tokens are stored securely using Chrome's storage API
- All communication with GitHub uses HTTPS
- ZIP file processing happens entirely in the browser

## Support & Resources

### Documentation & Tutorials

- 📺 [Watch our video tutorials](https://youtube.com/@aidrivencoder)
- 📖 [Read the documentation](https://github.com/mamertofabian/bolt-to-gitlab)
- 💡 [Get development tips](https://aidrivencoder.com)
- 💬 [Discord Community](https://discord.gg/JtjYHBBnGU)

### Professional Support

- 📊 [Book a consultation](https://calendly.com/mamerto/30min)
- 📧 [Email support](mailto:mamerto@codefrost.com)
- 💻 [Custom development inquiries](https://codefrost.com)

### Report Issues

For bugs or feature requests, please [open an issue](https://github.com/mamertofabian/bolt-to-gitlab/issues) on the GitHub repository.

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
