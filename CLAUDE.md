# CLAUDE.md - Development Guide

## Commands

- Build: `npm run build` - Create production build
- Dev: `npm run dev` - Start development server
- Watch: `npm run watch` - Build and watch for changes
- Lint: `npm run lint` - Run ESLint
- Lint+Fix: `npm run lint:fix` - Fix linting issues
- Format: `npm run format` - Check formatting with Prettier
- Format+Fix: `npm run format:fix` - Fix formatting issues
- Type Check: `npm run check` - Run TypeScript type checking

## Code Style Guidelines

- Svelte v4.x with TypeScript for all components
- ESM modules only (type: "module" in package.json)
- Strict TypeScript: explicit types, no implicit any, strict null checks
- Svelte component props must be properly typed
- Soft limit of 300 lines per file
- Formatting: 2-space indent, single quotes, 100 char line limit
- Import path aliases: use $lib/\* for imports from src/lib
- No console.log (only warn/error) in production code
- TailwindCSS for styling, follow theme system in tailwind.config.js
- Chrome Extension manifest v3 standards
- Use bits-ui for UI components, lucide-svelte for icons
- Error handling: prefer explicit error types and descriptive messages

## Security

- Never commit API keys/tokens/credentials
- Use environment variables for secrets
- Keep credentials out of logs and outputs
