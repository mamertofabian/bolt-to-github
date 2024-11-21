# Bolt Zip to GitHub - Chrome Extension

A Chrome extension that automatically captures ZIP file downloads from bolt.new, extracts them, and pushes the contents to a specified GitHub repository. Built with Svelte, TypeScript, and TailwindCSS.

## Features

- 🚀 Automatic ZIP file interception from bolt.new
- 📦 In-browser ZIP file extraction
- 🔄 Direct GitHub repository integration
- 🔒 Secure credential storage
- ⚡ Real-time processing status updates
- 🎨 Clean, responsive UI with TailwindCSS

## Prerequisites

- Node.js (v16 or later)
- npm or yarn
- Chrome browser
- GitHub account with a personal access token

## Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/bolt-file-processor.git
cd bolt-file-processor
```

2. Install dependencies:

```bash
npm install
```

3. Build the extension:

```bash
npm run build
```

4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked"
   - Select the `dist` directory from your project folder

## Development

Start the development server with hot reload:

```bash
npm run watch
```

Run type checking:

```bash
npm run check
```

Build for production:

```bash
npm run build
```

## Configuration

1. Click the extension icon in Chrome
2. Enter your GitHub credentials:
   - Personal Access Token (needs repo permissions)
   - Repository Owner
   - Repository Name
   - Branch Name (defaults to 'main')
3. Click "Save Settings"

## Project Structure

```
.
├── manifest.json          # Chrome extension manifest
├── package.json          # Project dependencies and scripts
├── src/
│   ├── background.ts     # Extension background service
│   ├── lib/             # Utility functions and services
│   │   ├── github.ts    # GitHub API integration
│   │   └── zip.ts       # ZIP file processing
│   ├── popup/           # Extension popup UI
│   │   ├── App.svelte   # Main popup component
│   │   ├── index.html   # Popup HTML template
│   │   └── main.ts      # Popup entry point
│   ├── styles/          # Global styles
│   └── types/           # TypeScript type definitions
├── tailwind.config.js    # TailwindCSS configuration
├── tsconfig.json         # TypeScript configuration
└── vite.config.ts       # Vite build configuration
```

## Tech Stack

- [Svelte](https://svelte.dev/) - UI framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Vite](https://vitejs.dev/) - Build tool
- [TailwindCSS](https://tailwindcss.com/) - Styling
- [JSZip](https://stuk.github.io/jszip/) - ZIP file processing
- [Octokit](https://github.com/octokit/rest.js/) - GitHub API client

## Security

- GitHub tokens are stored securely using Chrome's storage API
- All communication with GitHub uses HTTPS
- ZIP file processing happens entirely in the browser

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

## Permissions

This extension requires the following permissions:

- `webRequest`: To intercept downloads
- `downloads`: To manage downloads
- `storage`: To store settings
- `scripting`: To interact with bolt.new

## License

MIT License - see LICENSE file for details

## Support

For bugs or feature requests, please open an issue on the GitHub repository.

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

- [ ] File filtering options
- [ ] Multiple repository support
- [ ] Custom commit messages
- [ ] Progress indicators
- [ ] File preview before push
- [ ] Custom file path mapping

## Acknowledgments

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Svelte Documentation](https://svelte.dev/docs)
- [GitHub API Documentation](https://docs.github.com/en/rest)
