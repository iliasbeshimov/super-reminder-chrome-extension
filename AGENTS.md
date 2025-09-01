# Repository Guidelines

## Project Structure & Modules
- `manifest.json`: Chrome extension manifest (MV3, background service worker).
- `background/`: `service_worker.js` for alarms, events, and storage coordination.
- `popup/`: UI (`popup.html`, `popup.css`, `popup.js`).
- `content/`: Page-facing logic and styles (`takeover_injector.js`, `takeover.css`).
- `shared/`: Reusable utilities (`storage.js`, `alarms.js`).
- `icons/`: Extension icons.

## Build, Test, and Development
- Load Unpacked: `chrome://extensions` → enable Developer Mode → Load unpacked → select repo root.
- Reload During Dev: After changes, click Reload on the extension card.
- Inspect Logs: Use “Service Worker” link on the extension card for background logs; popup logs via popup’s Inspect.
- Package Zip:
  - Script: `powershell -ExecutionPolicy Bypass -File scripts/package.ps1`
  - Manual (Windows PowerShell): `Compress-Archive -Path * -DestinationPath dist.zip -Force`.

## Coding Style & Naming
- JavaScript: 4-space indentation, semicolons required.
- Naming: `camelCase` for variables/functions, `UPPER_SNAKE_CASE` for constants.
- Files/Dirs: lowercase; use underscores when helpful (e.g., `takeover_injector.js`).
- Modules: ES modules with relative imports (see `shared/*.js`).
- Linting: Keep functions small, validate inputs, prefer `textContent`/escape helpers for DOM safety.

## Testing Guidelines
- Automated Tests: None yet. For pure functions, add Jest in a future PR under `__tests__/` mirroring `shared/`.
- Manual Checks: Create/edit/delete reminders in the popup; verify alarms generate expected notifications; check whitelist add/remove; confirm storage via `chrome.storage.sync.get` in DevTools.
- Naming (future tests): `*.test.js` named after the module under test.

## Commit & Pull Request Guidelines
- Commits: Imperative subject line, concise body. Example: `fix(storage): handle invalid reminder times`.
- PRs: Include summary, rationale, before/after behavior, and screenshots for UI changes. Link related issues.
- Scope: Keep PRs focused (single feature/fix). Note any follow-ups.

## Security & Configuration Tips
- Permissions: Keep manifest permissions minimal; justify changes in PRs.
- Storage: Don’t store secrets in `chrome.storage`; validate and sanitize all user input.
- Content Scripts: Avoid injecting unsanitized HTML; prefer CSS/DOM APIs and escaping helpers.
