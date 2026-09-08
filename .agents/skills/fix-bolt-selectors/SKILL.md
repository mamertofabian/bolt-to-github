---
name: fix-bolt-selectors
description: Recover the Chrome extension's bolt.new DOM selectors after Bolt redesigns its UI. Use when the Push to GitHub button stops appearing, or the Download / Export flow fails with "Export menu trigger not found" or "Download button not found". Also use after running scripts/capture-bolt-dom.mjs when a fresh DOM capture is sitting in /tmp/bolt-dom-capture/.
disable-model-invocation: true
context: fork
allowed-tools: Bash(git *), Bash(pnpm *), Bash(node *), Bash(ls *), Bash(cat *), Bash(grep *), Bash(diff *), Read, Edit, Write, Glob
---

# Fix bolt.new selectors

You are recovering this Chrome extension after Bolt redesigned `bolt.new`. Two surfaces break the most often:

1. **Download / Export flow** — `src/services/DownloadService.ts` finds the project-name dropdown, opens it, finds the Export menuitem, hovers it to expose the submenu, and clicks the Download item.
2. **Push to GitHub button injection** — `src/content/managers/GitHubButtonManager.ts` finds the toolbar container in the top-right of a project page and injects the GitHub button there (or before the Publish button).

A capture script at `scripts/capture-bolt-dom.mjs` produces fresh DOM snapshots in `/tmp/bolt-dom-capture/` covering both surfaces. Existing fixtures live at the repo root: `bolt-download-button.html`, `bolt-download-button-v3.html`, `bolt-publish-button.html`.

## Prerequisites

Before running this skill, the user must have run the capture script and confirmed `/tmp/bolt-dom-capture/` contains fresh files. If the directory is empty or stale (older than 30 minutes), STOP and ask the user to run:

```
cd ~/projects/codefrost-dev/bolt-to-github && node scripts/capture-bolt-dom.mjs
```

Do not attempt to capture the DOM yourself. Login is human-only.

## Step-by-step

### 1. Inspect the fresh capture

```
ls -la /tmp/bolt-dom-capture/ | head -20
```

Identify the most recent `toolbar-*.html`, `toolbar-*.json`, `header-*.html`, `menus-*.html`, and `snapshot-*.json` files (timestamp suffix matches across the set).

Read each one. Hold the four artifacts in mind:

- `toolbar-*.html` + `toolbar-*.json` drive Push button decisions.
- `header-*.html` + `menus-*.html` + `snapshot-*.json` drive Download flow decisions.

### 2. Read current source

Read these files in full before editing anything:

- `src/services/DownloadService.ts`
- `src/content/managers/GitHubButtonManager.ts`
- `src/services/__tests__/DownloadService.test.ts`

The selectors of interest live around these regions:

- `DownloadService.ts` — `findAndClickExportButton`, `findAndClickDownloadButton`. Specifically the chevron / caret detection on the project-name button, the Export menuitem text match, and the Download menuitem icon match.
- `GitHubButtonManager.ts` — `initialize()` method. `div.ml-auto > div.flex.gap-{2,3}` toolbar container, inner `div.flex.gap-1` (non-`empty:hidden`) target, `button[aria-controls="publish-menu"]` fallback.

### 3. Diff against existing fixtures

Compare the new capture against the current fixture (`bolt-download-button-v3.html` for the dropdown surface, `bolt-publish-button.html` for the toolbar surface). For each surface, list the selectors that no longer match and the new candidates.

Output a short diff summary (5-10 lines) before making any edits, in this shape:

```
Download flow:
  - chevron icon: i-ph:caret-down → i-heroicons:chevron-down (example)
  - Export menuitem icon: ...
Push button flow:
  - toolbar container: div.ml-auto > div.flex.gap-3 → ...
  - publish button: aria-controls="publish-menu" → aria-controls="..."
```

If a surface is unchanged, say so and skip its edit step.

**Superset rule.** A class-list change is not necessarily a break. If the new DOM is a superset of the old (e.g., the toolbar container went from `flex gap-2` to `flex 2xl:gap-3 gap-2`, which still contains `gap-2`), the existing selector still matches. Report "no break" and skip. Do not add modernizing edits the user didn't ask for.

**Concerns to surface but NOT fix.** Some changes are worth flagging without acting on them:

- Bolt may ship its own native widgets near the extension's injection points (e.g., a built-in "Connect project to GitHub" button). The extension may still inject correctly, but UX is now adjacent to a competing control. Flag it.
- Wrapper elements may appear around buttons we target as anchors (e.g., a `<span>` around the Publish button). If our primary path doesn't hit the fallback, the fallback may now insert into the wrong parent. Flag it as latent risk, do not change code.

End the diff step with a "Concerns surfaced, not fixed:" section so the user can decide whether to follow up separately.

### 4. Set up branches per AGENTS.md convention

Read the repo's AGENTS.md branching strategy. In short:

```bash
# Identify next version
NEXT_VERSION=$(grep '"version"' package.json | head -1 | sed -E 's/.*"([^"]+)".*/\1/' | awk -F. '{$NF=$NF+1; OFS="."; print $0}')
DEV_BRANCH="dev-v${NEXT_VERSION}"

# Create dev branch if missing
git fetch origin main
git show-ref --verify --quiet "refs/heads/${DEV_BRANCH}" || git branch "${DEV_BRANCH}" main

# Create fix branch off dev branch
git checkout -b "fix/bolt-new-dom-$(date +%Y%m)" "${DEV_BRANCH}"
```

Confirm with the user before pushing if they have an existing in-progress branch.

### 5. Save the new fixture(s)

Pick the next version suffix (look at existing `bolt-download-button-v*.html` files). Save the new captures next to them:

- Dropdown: `cp /tmp/bolt-dom-capture/header-*.html bolt-download-button-vN.html`
- Toolbar: `cp /tmp/bolt-dom-capture/toolbar-*.html bolt-publish-button-vN.html` (only if the publish surface changed)

### 6. Write failing Vitest tests FIRST (TDD non-negotiable)

The repo's AGENTS.md mandates strict TDD: tests first, confirm red, then implement. For the Download flow, add tests inside `src/services/__tests__/DownloadService.test.ts`. For the Push flow, find the matching test file under `src/content/managers/__tests__/` (or create one if missing).

Each test must construct a minimal jsdom representation of the new selectors. Patterns to follow are already in `DownloadService.test.ts` (look for `findAndClickExportButton` and `findAndClickDownloadButton` describe blocks).

Run only the relevant test file and confirm RED:

```bash
pnpm vitest run src/services/__tests__/DownloadService.test.ts
```

Do not proceed until the new tests fail with the expected error.

### 7. Update selectors — library-agnostic by default

Bolt has shipped Lucide, Phosphor, and Heroicons across redesigns. Hardcoding `i-lucide:` or `i-ph:` prefixes is the original sin. Default to substring matchers like `[class*="chevron-down"], [class*="caret-down"]` rather than fully-qualified prefixes. Keep older strategies as fallbacks; never remove them — older bolt.new tabs may still render the previous DOM.

For the toolbar, the same principle applies: prefer accessible-name matchers (text content, aria-label) over class names. If the publish button ever drops `aria-controls="publish-menu"`, fall back to a button with text matching `/publish|deploy|share/i`.

Run the test file again. Confirm GREEN.

### 8. Run the full quality gates

```bash
pnpm lint
pnpm build
pnpm test:ci
```

All three must pass before commit.

### 9. Commit and PR

Single combined commit with a message that names the breakage and the fix shape:

```
fix: restore <flow> against <date> Bolt DOM (<root cause>)

<2-3 sentences root cause>

<2-3 lines listing selector changes>
```

Include the fixture file(s), the test changes, and the source edits in the same commit.

Push and open a PR targeting the dev branch (NOT main):

```bash
gh pr create --base "${DEV_BRANCH}" --head "$(git branch --show-current)" --title "..." --body "..."
```

Report the PR URL back to the main session.

## Hard rules

- **Never auto-run the capture script.** It needs human login. Ask the user if `/tmp/bolt-dom-capture/` is empty or stale.
- **Never delete or weaken existing strategies.** Make selectors more permissive, not less. Older Bolt DOM still exists in cached tabs.
- **Tests first, always.** Confirm red before implementing. The repo's TDD rule is non-negotiable.
- **PR targets the dev branch, not main.** Per repo AGENTS.md branching convention.
- **One combined commit unless the user says otherwise.** Tests + implementation + fixture in the same commit is the project's preferred shape.

## Reference paths

- Capture script: `scripts/capture-bolt-dom.mjs`
- Capture output: `/tmp/bolt-dom-capture/`
- Existing fixtures: `bolt-download-button.html`, `bolt-download-button-v3.html`, `bolt-publish-button.html`
- Source files: `src/services/DownloadService.ts`, `src/content/managers/GitHubButtonManager.ts`
- Tests: `src/services/__tests__/DownloadService.test.ts`, `src/content/managers/__tests__/`
- Branching rules: `AGENTS.md` "Versioned Development Branch Strategy"
