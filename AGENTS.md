# Repository Guidelines

## Project Structure & Module Organization

This is a Chrome Manifest V3 extension built with Svelte, TypeScript, TailwindCSS, Vite, and CRXJS. Source code lives in `src/`: `background/` is the service worker, `content/` integrates with bolt.new, `popup/` contains the extension UI, `pages/` contains standalone extension pages, `services/` handles GitHub/auth/sync logic, and `lib/` contains shared utilities, stores, constants, and components. Tests are colocated in `__tests__/` folders or named `*.test.ts` / `*.spec.ts`. Shared test setup is in `src/test/setup/`; e2e tests are in `e2e/`, assets in `assets/`, and reference docs in `docs/`.

## Build, Test, and Development Commands

Use `pnpm`; do not switch package managers.

- `pnpm install` installs dependencies from `pnpm-lock.yaml`.
- `pnpm dev` starts the Vite dev server for UI iteration.
- `pnpm watch` builds the extension to `dist/` and watches for changes; load `dist/` in Chrome developer mode.
- `pnpm build` creates a production extension build.
- `pnpm lint` runs ESLint over `src/**/*.{js,ts,svelte}`.
- `pnpm check` runs `svelte-check` with TypeScript validation.
- `pnpm test:ci` runs Vitest once without coverage; `pnpm test` runs Vitest with coverage.
- `pnpm test:e2e` runs Playwright tests.

## Coding Style & Naming Conventions

Use strict TypeScript and ESM imports. Svelte components must use `<script lang="ts">`. Prefer `$lib/*` for imports from `src/lib`. Prettier uses 2 spaces, single quotes, 100-character lines, and ES5 trailing commas. Use TailwindCSS for UI styling and `lucide-svelte` for icons. Avoid `any`; use concrete types or `unknown` with narrowing. Test files should use names such as `FileChanges.component.test.ts`, `ServiceName.test.ts`, or `Feature.logic.test.ts`.

## Testing Guidelines

Vitest uses `jsdom`, globals, and setup from `src/test/setup/vitest-setup.ts`; coverage uses V8 and writes to `coverage/`. Follow `docs/unit-testing-rules.md` for classes, services, and utilities, and `docs/component-testing-rules.md` for Svelte UI tests. Prefer TDD for behavior changes: add a focused failing test, implement the fix, then run the relevant tests plus `pnpm lint` and `pnpm check`.

## MAID Workflow

This repository uses MAID for AI-assisted code changes. Use the repository wrapper, not a global `maid` executable:

- `./scripts/maid validate --manifest-dir manifests --mode schema`
- `./scripts/maid validate --manifest-dir manifests --mode behavioral`
- `./scripts/maid validate --manifest-dir manifests --mode implementation`
- `./scripts/maid test --manifest-dir manifests`

Wrapper aliases are available through `pnpm maid:*` scripts. Keep active manifests directly under `manifests/`. For new features, bug fixes, and refactors, create or evolve a manifest first, validate the behavioral contract, then implement within manifest scope. When touching files that lack MAID coverage, add focused behavioral or characterization coverage in the same change.

Draft manifests under `manifests/drafts/` are planning inventory, not active
contracts. Promote one implementation-sized draft into `manifests/`, implement
and review the promoted manifest, then remove only the matching draft path.

After implementation validation and implementation review, capture an Outcome
record in the promoted active manifest before final handoff. Outcome capture is
required for completed, partial, failed, superseded, archived, or abandoned MAID
work. The Outcome must cite concrete validation evidence and review notes; it
does not replace behavioral tests, declared artifacts, validation commands, or
implementation review. See `docs/draft-manifest-workflow.md` and
`docs/manifest-outcome-records.md`.

## Commit & Pull Request Guidelines

History follows Conventional Commits, for example `feat: mint independent Supabase session` and `fix: address PR review issues`. Branch from the active `dev-vX.Y.Z` branch; reserve `main` for releases. PRs should target the active dev branch, describe behavior changes, list validation commands, link issues when applicable, and include screenshots or recordings for visible UI changes.

## Security & Configuration Tips

Never commit GitHub tokens, Supabase secrets, API keys, or generated credential files. Keep Chrome extension permissions minimal and update `manifest.json` deliberately. Make degraded auth, sync, and network states visible in UI or logs.

<!-- BEGIN MAID RUNNER -->

## MAID Runner

Instruction payload version: 2026.09.02.1

### MAID Codex Skills Workflow

Use the installed MAID Codex skills for manifest-driven development: `maid-planner`, `maid-plan-review`, `maid-implement-draft`, `maid-implementer`, `maid-implementation-review`, `maid-evolver`, `maid-auditor`, `maid-incident-logger`, `maid-outcome-enrich`, `maid-run-review`.

For new features, bug fixes, and refactors, plan with `maid-planner`, review with `maid-plan-review`, implement with `maid-implementer`, and review the result with `maid-implementation-review` before handoff. When continuing from `manifests/drafts/*.manifest.yaml`, use `maid-implement-draft` to harden, lock, promote, implement, review, and capture Outcome.

Before editing a file during an active MAID task, run `./scripts/maid hook scope-check --path <file>` and treat exit code 2 as out-of-scope. This pre-edit hook check is advisory and does not replace `maid verify` changed-scope validation.

Before treating a file's language as unsupported, run `maid validators` and install a matching validator plugin when available instead of skipping MAID for that file.

Draft manifests under `manifests/drafts/` are planning inventory, not active contracts. Child implementation drafts live at `manifests/drafts/*.manifest.yaml`; epic planning records live at `manifests/drafts/*.epic.yaml` and use split-before-promote before implementation; archived draft records are historical inventory. Before promoting the selected child draft, refresh the Outcome index when needed and run `./scripts/maid recall --for-manifest manifests/drafts/<slug>.manifest.yaml --plan-packet` when completed Outcome records exist. Recall is advisory planning context only: it can inform draft hardening and implementation risks, but it does not expand scope or replace red evidence, behavioral validation, plan lock, implementation validation, or review. Use `./scripts/maid insights` to review recurring Outcome lessons when an index is available. To intentionally include instructive failed or abandoned Outcome lessons, refresh the index with `./scripts/maid learn --include-status completed --include-status abandoned`, then recall from that index; the completed-only default is unchanged. When related Outcome evidence is retrieved, do not dump a raw recall or insights transcript into the task. Digest it visibly: name applicable lessons, reject stale or irrelevant lessons with a reason, and state what changed because of the evidence for the current planning, implementation, or review phase. Recalled, aggregated, and digested Outcomes remain advisory planning context only; they do not create an approval, promotion, done, or review gate. Promote one selected child draft with `./scripts/maid manifest promote manifests/drafts/<slug>.manifest.yaml`. Do not manually move or copy draft manifests. For metadata-only reference cleanup on locked active manifests, use `./scripts/maid plan revise <manifest> --reason "<text>" --preserve-red-evidence`. For review-driven behavioral contract changes after implementation exists, use `./scripts/maid plan revise <manifest> --reason "<text>" --stash-implementation` so MAID temporarily hides declared implementation changes while it captures fresh red evidence.

Always capture an Outcome record after implementation validation and implementation review, before final handoff. Capture Outcome after implementation review so the result records the reviewed evidence. Outcome capture is required for completed, partial, failed, superseded, archived, or abandoned MAID work. The Outcome must cite concrete validation evidence and review notes; it does not replace behavioral tests, declared artifacts, validation commands, or implementation review. After Outcome capture, run `./scripts/maid learn` to refresh the local `.maid/outcomes.json` advisory index for subsequent recall. `.maid/outcomes.json` is generated and ignored; do not commit it. If `maid learn` fails, report the refresh failure as advisory unless recall or insights are required for the current task. See `docs/draft-manifest-workflow.md` and `docs/manifest-outcome-records.md`.

Installed Codex skill-local agent metadata files: 10.

<!-- END MAID RUNNER -->
