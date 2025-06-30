Bump the extension version and prepare for new development: $ARGUMENTS.

Follow these steps:

1. Check current branch - must be on main branch to start
2. Create new development branch following the versioned branch strategy:
   - Branch name format: `dev-v{NEW_VERSION}`
   - Example: If bumping to 1.3.8, create `dev-v1.3.8`
3. Update version number in all required files:
   - `package.json` - Update the "version" field
   - `manifest.json` - Update the "version" field
4. Prepare changelog template:
   - Add new version section at the top of `CHANGELOG.md`
   - Include placeholder sections for: New Features, Performance & Stability, Testing & Quality, Bug Fixes, Documentation
   - Use format: `## 2025-XX-XX - Version {NEW_VERSION}`
5. Update README.md:
   - Update "Latest Version" section to the new version
   - Add placeholder section for new version highlights and benefits
   - Move previous version info down
6. Update whatsNewContent.ts:
   - Add new version entry with template highlights
   - Include placeholder date, highlights array, details, and type
7. Run quality checks:
   - `pnpm run lint` - Ensure no linting errors
   - `pnpm run check` - Verify TypeScript compilation
   - `pnpm run build` - Build the extension successfully
8. Commit changes with message: "chore: prepare version {NEW_VERSION}"
9. Push the new branch to remote with upstream tracking
10. Provide summary of completed tasks and next steps

Example usage:

- `/project:bump-version 1.3.8` - Bumps to version 1.3.8
- `/project:bump-version 1.4.0` - Bumps to version 1.4.0 (major feature release)

Note: The version should follow semantic versioning (MAJOR.MINOR.PATCH)
