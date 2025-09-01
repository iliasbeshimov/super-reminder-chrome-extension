# Contributing

## Getting Started
- No build step required. Load the extension via `chrome://extensions` → Developer Mode → Load unpacked.
- Primary code lives in `background/`, `popup/`, `content/`, and `shared/`; see `AGENTS.md` for structure and style.

## Branching & Commits
- Branches: `feature/<short-name>`, `fix/<short-name>`, `chore/<task>`.
- Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`; use optional scope, e.g., `fix(storage): handle invalid reminder times`.

## Code Style
- JavaScript with 4-space indentation and semicolons.
- `camelCase` for variables/functions; `UPPER_SNAKE_CASE` for constants; lowercase filenames.
- Keep functions small and validate inputs; escape user-provided strings before inserting into DOM.

## Manual QA Checklist
- Popup: create, edit, delete reminders; validate future date/time checks; empty states.
- Alarms: verify scheduled alarms trigger and cleanup works.
- Whitelist: add/remove domains; confirm persistence via `chrome.storage.sync.get` in DevTools.
- Logs: check background Service Worker console for errors.

## Pull Requests
- Include summary, rationale, before/after behavior, and screenshots for UI changes.
- Note permission changes in `manifest.json` and justify impact.
- Keep PRs focused; link related issues and list follow-ups if any.

## Packaging
- Preferred: `powershell -ExecutionPolicy Bypass -File scripts/package.ps1` to build `dist/super-reminder.zip`.
- Ensure no secrets or development files are included.
