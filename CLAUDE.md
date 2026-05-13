# Tokenmeter — Claude Code Working Guide

## Project Overview
Tokenmeter is a Windows Electron desktop app that reads local Claude Code and Gemini CLI JSONL files, aggregates token usage, estimates costs, and displays them in a dark terminal-style dashboard.

## Architecture
- **main.js** — Electron main process: file I/O, JSONL parsing, IPC handlers, auto-refresh (60s)
- **preload.js** — contextBridge exposing safe API to renderer
- **renderer/** — Chromium renderer: HTML/CSS/JS, no Node access
- **src/** — Business logic: scanner, parsers, pricer, cache

## Key Rules
- `contextIsolation: true`, `nodeIntegration: false` — all file I/O in main.js only
- Use `process.env.USERPROFILE` for Windows home path (not `os.homedir()`)
- Claude projects folder uses `--` as path separator in folder names
- All cost estimates labelled clearly as estimates
- Incremental file scanning: only re-read files whose `mtime` changed

## Data Sources
- Claude Code: `%USERPROFILE%\.claude\projects\**\*.jsonl`
- Gemini CLI: `%USERPROFILE%\.gemini\tmp\chats\session-*.jsonl`
- Pricing config: `pricing.json` (user-editable)
- App config: `electron-store` → `%APPDATA%\Tokenmeter\config.json`

## Tech Stack
- Electron (latest stable)
- Vanilla HTML + CSS + JS (no frontend framework)
- Chart.js from CDN
- electron-store for preferences/cache
- electron-builder for Windows NSIS packaging

## Commit Discipline
Make incremental commits after each logical piece:
1. Scaffold (package.json, main.js skeleton, preload.js, index.html shell)
2. Parsers (claude-parser.js, gemini-parser.js, pricer.js)
3. IPC wiring (scanner.js, cache.js, IPC handlers in main.js)
4. UI shell (title bar, sidebar, page routing, styles.css)
5. Overview page
6. Claude detail page
7. Gemini detail page
8. Idle animations (claudepix)
9. Settings modal
10. Build config (electron-builder)

## Project Name Decoding
Folder names under `.claude/projects/` use `--` as separator:
- `C--Users-Dewashish-Lambore-desktop-projects-burnlink` → `burnlink`
- `C--Users-Dewashish-Lambore` → `Home`
- Split on `-desktop-projects-` to extract project name, or use last segment
