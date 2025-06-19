# CLAUDE.md - Development Guide

## Overview

Bolt to GitHub is a Chrome Extension (Manifest v3) that automatically captures ZIP file downloads from bolt.new, extracts them, and pushes contents to GitHub repositories. Built with Svelte v4.2.x, TypeScript v5.6.x, and TailwindCSS.

**Current Version**: v1.3.5  
**Repository**: mamertofabian/bolt-to-github  
**Package Manager**: pnpm (required)

## Memories and Branching Guidelines

- Follow @docs/unit-testing-rules.md .
  **CRITICAL**: Always follow the versioned development branch strategy below - NEVER branch directly off main for features/fixes.
- Unless doing a TDD session, the task is never considered complete if there are failing tests

### Versioned Development Branch Strategy

When starting new development work:

1. **Check for Development Version Branch**: Look for existing `dev-v{NEXT_VERSION}` branch (e.g., if main is v1.3.3, check for `dev-v1.3.4`)
2. **Branch Creation Logic**:
   - **If dev version branch EXISTS**: Create your feature/fix branch from `dev-v{NEXT_VERSION}`
   - **If dev version branch DOES NOT exist**:
     - First create `dev-v{NEXT_VERSION}` from `main`
     - Then create your feature/fix branch from the new dev version branch
3. **Pull Request Targets**:
   - **Default**: All PRs target the `dev-v{NEXT_VERSION}` branch
   - **Exception**: Only target `main` when deploying/releasing the new version

[... rest of the file remains unchanged ...]
