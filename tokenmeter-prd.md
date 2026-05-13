# Tokenmeter — Product Requirements Document
**Version:** 1.0  
**Author:** Dewashish Lambore  
**Status:** Draft — Ready for Development  
**Target Developer:** Claude Code  

---

## 1. Product Overview

### 1.1 What is Tokenmeter?

Tokenmeter is a Windows desktop application built with Electron that gives developers a quick, glanceable dashboard of their AI CLI token usage. It reads local data files written by Claude Code and Gemini CLI, aggregates token counts, estimates API-equivalent costs, and displays everything in a dark, terminal-esque UI inspired by Clawdmeter.

It is **not** a notification-heavy or attention-grabbing tool. It lives quietly on your desktop. You glance at it. You get the info. You move on.

### 1.2 Core Philosophy

- **Glanceable, not demanding.** No alerts in v1. No nagging. Just data.
- **Local-first.** Reads only local files. No external API calls in v1.
- **Extensible.** Designed so adding a new CLI later is a matter of adding one data adapter.
- **Honest.** Cost estimates are clearly labelled as estimates ("~$X.XX if billed at API rates").

### 1.3 Scope for v1

| In Scope | Out of Scope |
|---|---|
| Claude Code usage tracking | OpenCode |
| Gemini CLI usage tracking | Free-claude-code (NIM) |
| Token counts (input, output, cache) | Live API polling / rate limit % |
| Estimated API cost | Desktop notifications / alerts |
| Per-project breakdown | Cloud sync or remote data |
| Daily activity chart (14 days) | Windows tray icon (v2) |
| Model breakdown per CLI | Mobile / web version |
| Claudepix animations on idle screen | Multi-user / team features |

---

## 2. Target User

**Primary:** Dewashish Lambore — a developer on Windows who uses Claude Code and Gemini CLI daily across multiple projects, wants to track cumulative token burn without opening logs manually, and wants something that feels like part of a developer's setup rather than a consumer product.

**General profile for future users:** Solo devs or small teams running multiple AI CLIs, on subscription plans (so cost is estimated, not billed directly), who want ambient visibility into their usage without switching contexts.

---

## 3. Data Sources

### 3.1 Claude Code

**Primary source:** `%USERPROFILE%\.claude\projects\**\*.jsonl`  
**Secondary source:** `%USERPROFILE%\.claude\transcripts\**\*.jsonl` (if present)  
**Bonus source:** `%USERPROFILE%\.claude\stats-cache.json` (aggregated stats cache — read if present, don't depend on it)

**JSONL record format (relevant lines only):**
```json
{
  "type": "assistant",
  "message": {
    "model": "claude-sonnet-4-20250514",
    "usage": {
      "input_tokens": 1234,
      "output_tokens": 567,
      "cache_read_input_tokens": 890,
      "cache_creation_input_tokens": 200
    }
  },
  "timestamp": "2025-05-14T10:30:00Z"
}
```

**Project path decoding:**  
The folder names under `projects/` encode the full path using `--` as separator. For example:  
`projects/C--Users-Dewashish-Lambore-desktop-projects-burnlink/` → project name is `burnlink`  
Extract the last meaningful segment after the last `-` separator (or split on `-desktop-projects-` to get project name).

**Known projects on this machine:**
- `C--Users-Dewashish-Lambore` → home dir sessions (label as "Home")
- `C--Users-Dewashish-Lambore-desktop-projects-astrowithinai` → astroWithinAI
- `C--Users-Dewashish-Lambore-desktop-projects-burnlink` → burnlink
- `F--astroai` → astroai (F: drive)
- `F--burnlink` → burnlink (F: drive)

### 3.2 Gemini CLI

**Primary source:** `%USERPROFILE%\.gemini\tmp\chats\session-*.jsonl`  
**Fallback source:** `%USERPROFILE%\.gemini\history\` (project-specific histories)

**Session JSONL format (Gemini):**
```json
{
  "usageMetadata": {
    "promptTokenCount": 1234,
    "candidatesTokenCount": 567,
    "totalTokenCount": 1801
  }
}
```
Or in some versions:
```json
{
  "usage": {
    "input_tokens": 1234,
    "output_tokens": 567
  }
}
```

**Note:** Gemini CLI's local session logging is not guaranteed to be complete — if files are sparse or empty, the app should show a graceful "limited data" state with a note explaining how to enable telemetry locally.

### 3.3 Parser Rules (Both CLIs)

- Parse files lazily: only re-read files modified since the last scan.
- Skip empty files and files with parse errors silently (log to a debug file).
- Timestamp each session by the `.jsonl` file's `mtime` (last modified time).
- Aggregate daily buckets using local time (not UTC) so daily charts match the user's workday.
- Maximum look-back: 90 days. Files older than 90 days are ignored.

---

## 4. Token Pricing (Estimates)

Cost estimates use the following table. These are labelled as estimates in the UI. They should be stored in a config file (`pricing.json`) so the user can update them if prices change.

### Claude Models
| Model pattern | Input ($/M tokens) | Output ($/M tokens) | Cache Read | Cache Write |
|---|---|---|---|---|
| `claude-opus-4` | $15.00 | $75.00 | $1.50 | $18.75 |
| `claude-sonnet-4` | $3.00 | $15.00 | $0.30 | $3.75 |
| `claude-haiku-4` | $0.80 | $4.00 | $0.08 | $1.00 |
| `claude-3-5-sonnet` | $3.00 | $15.00 | $0.30 | $3.75 |
| `claude-3-5-haiku` | $0.80 | $4.00 | $0.08 | $1.00 |
| `claude-3-opus` | $15.00 | $75.00 | $1.50 | $18.75 |
| default (unknown) | $3.00 | $15.00 | — | — |

Model matching: check if the model string from the JSONL *contains* the pattern (e.g. `claude-sonnet-4-20250514` matches `claude-sonnet-4`). Use longest match wins.

### Gemini Models
| Model pattern | Input ($/M tokens) | Output ($/M tokens) |
|---|---|---|
| `gemini-2.5-pro` | $1.25 | $10.00 |
| `gemini-2.5-flash` | $0.075 | $0.30 |
| `gemini-2.0-flash` | $0.075 | $0.30 |
| default (unknown) | $0.075 | $0.30 |

---

## 5. Application Architecture

### 5.1 Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Electron (latest stable) |
| Frontend | Vanilla HTML + CSS + JavaScript (no framework) |
| IPC | Electron's `ipcMain` / `ipcRenderer` via `contextBridge` |
| File I/O | Node.js `fs` module in main process |
| Charts | Chart.js (loaded from CDN in renderer) |
| Animations | claudepix sprites (fetched from `claudepix.vercel.app`) |
| Storage | `electron-store` for user preferences and scan cache |
| Build | `electron-builder` for Windows NSIS installer |

### 5.2 Process Separation

```
main.js (Node/Electron main process)
├── File scanning & JSONL parsing
├── Pricing calculations
├── IPC handlers (respond to renderer requests)
├── Auto-refresh timer (every 60 seconds)
└── Window management

preload.js (context bridge)
└── Exposes safe API to renderer: getUsageData(), window controls, openExternal()

renderer/ (Chromium renderer process)
├── index.html — app shell
├── app.js — UI logic, chart rendering, page switching
├── animations.js — claudepix sprite fetching & display
└── styles.css — all visual styles
```

### 5.3 IPC Contract

```javascript
// Renderer → Main
ipcRenderer.invoke('get-usage-data')        // returns full UsageData object
ipcRenderer.invoke('window-minimize')
ipcRenderer.invoke('window-maximize')
ipcRenderer.invoke('window-close')
ipcRenderer.invoke('open-external', url)    // open links in browser

// Main → Renderer (push updates)
ipcMain.emit('usage-updated', usageData)    // after each auto-refresh cycle
```

### 5.4 UsageData Object Shape

```javascript
{
  timestamp: Number,           // Date.now() when scan completed
  scanDurationMs: Number,
  claude: {
    available: Boolean,
    totalInputTokens: Number,
    totalOutputTokens: Number,
    totalCacheReadTokens: Number,
    totalCacheWriteTokens: Number,
    totalTokens: Number,
    estimatedCostUSD: Number,
    totalSessions: Number,
    modelBreakdown: {          // { "claude-sonnet-4-...": { input, output, cost } }
      [modelName]: { inputTokens, outputTokens, estimatedCostUSD }
    },
    projectBreakdown: [        // sorted by total tokens desc
      { name, inputTokens, outputTokens, totalTokens, estimatedCostUSD, sessionCount }
    ],
    daily: [                   // last 14 days, local time
      { date: "2025-05-14", label: "5/14", inputTokens, outputTokens, totalTokens, estimatedCostUSD }
    ],
    recentSessions: [          // last 10 sessions
      { project, mtime, inputTokens, outputTokens, model }
    ],
    dataNote: String | null    // e.g. "stats-cache.json also found" or null
  },
  gemini: {
    available: Boolean,
    totalInputTokens: Number,
    totalOutputTokens: Number,
    totalTokens: Number,
    estimatedCostUSD: Number,
    totalSessions: Number,
    daily: [ /* same shape as claude.daily */ ],
    recentSessions: [],
    dataNote: String | null    // e.g. "Limited data — enable local telemetry"
  },
  combined: {
    totalTokens: Number,
    estimatedCostUSD: Number,
    activeCLIs: Number,        // count of CLIs with available = true
    todayTokens: Number,
    todayCost: Number
  }
}
```

---

## 6. UI Specification

### 6.1 Window Properties

| Property | Value |
|---|---|
| Default size | 1280 × 820 px |
| Minimum size | 960 × 640 px |
| Resizable | Yes |
| Frame | None (frameless — custom title bar) |
| Background | `#07070d` |
| Always on top | No (but user-toggleable in settings, v2) |
| Start hidden | No |

### 6.2 Layout Structure

```
┌─────────────────────────────────────────────────────┐
│  TITLE BAR (48px)  [●●●]  TOKENMETER   [tabs] [time]│
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ SIDEBAR  │           MAIN CONTENT                   │
│ (220px)  │           (flex, scrollable)             │
│          │                                          │
│ nav      │                                          │
│ items    │                                          │
│          │                                          │
│ ──────── │                                          │
│ totals   │                                          │
└──────────┴──────────────────────────────────────────┘
```

### 6.3 Visual Design Tokens

```css
--bg:              #07070d
--surface:         #0e0e1a
--surface2:        #13132080
--border:          #1e1e35
--border-bright:   #2a2a4a
--text:            #e8e8f0
--text-muted:      #5a5a7a
--text-dim:        #3a3a5a

/* Per-CLI accent colors */
--accent-claude:   #d4a27a   /* warm amber */
--accent-gemini:   #4f9ef0   /* blue */
--accent-combined: #4ecca3   /* teal green */

/* Status colors */
--green:  #4ecca3
--yellow: #f5c96a
--red:    #f07060

/* Typography */
--font-mono:    'Space Mono', monospace
--font-body:    'DM Sans', sans-serif
--font-display: 'Syne', sans-serif

/* Border radius */
--radius:    12px
--radius-sm: 8px
```

### 6.4 Typography

Loaded from Google Fonts (internet required at startup; fall back to system monospace/sans if offline):

- **Display/headings:** Syne 700–800, uppercase where used for labels
- **Body:** DM Sans 300–500
- **Monospace/numbers:** Space Mono 400, 700

### 6.5 Title Bar

Custom frameless title bar, `-webkit-app-region: drag` on the bar itself, `no-drag` on interactive elements.

Contents (left to right):
- macOS-style traffic light buttons (close / minimize / maximize) — these are cosmetic on Windows but functional
- App name: **TOKEN**`METER` (the "METER" part in `--accent-claude`)
- Center: navigation tabs (Overview / Claude / Gemini)
- Right: last-updated timestamp (Space Mono, 10px), live green pulse dot, refresh button

### 6.6 Sidebar

Fixed 220px left column. Contents:

**Section: CLIs**
- Overview (always active by default)
- Claude Code — with a small amber dot and a token count badge
- Gemini CLI — with blue dot and token count badge

**Section: Add CLI (v2 placeholder)**
- Greyed out "+ Add CLI" item (non-functional in v1, signals extensibility)

**Bottom section (auto-margin-top):**
- Label: "ALL CLIS · ALL TIME" (Space Mono, 9px, dimmed)
- Large combined token count (Syne 700, 24px)
- Sub-label: "~$X.XX estimated" (muted)

Active nav item has a subtle left accent border in the CLI's color.

### 6.7 Pages

#### Page 1: Overview

Top stat row — 4 cards in a grid:
1. **Total Tokens** — combined all CLIs all time
2. **Est. API Cost** — combined, with "if billed at API rates" sub-label
3. **Active CLIs** — count of CLIs with data found
4. **Today** — combined tokens used today (local calendar day)

Below: two CLI summary cards side by side (Claude / Gemini). Each card shows:
- CLI name + color icon letter
- Status dot: green "ACTIVE" if data found, grey "NOT DETECTED" if not
- Input token meter bar + value
- Output token meter bar + value
- 3 mini-stats: Sessions | Total Tokens | Est. Cost
- If not detected: a note explaining where data should be

Below: Combined daily chart — a bar chart showing combined token usage across both CLIs for the last 14 days. Each bar stacked: Claude portion (amber) + Gemini portion (blue). X-axis: date labels (M/D). Y-axis: token count abbreviated (e.g. "120K"). Rendered with Chart.js.

#### Page 2: Claude Code Detail

**Header row:** "Claude Code" + amber accent + "X sessions · ~$Y.YY estimated"

**Section: Usage Summary**
4 stat cards:
- Total Input Tokens
- Total Output Tokens  
- Cache Read Tokens (with note: "saved ~$X.XX vs uncached")
- Cache Write Tokens

**Section: Daily Activity** — 14-day bar chart (input + output stacked, amber palette)

**Section: Model Breakdown** — table rows, one per model seen:
- Model name (truncated), horizontal bar showing proportion of total tokens, token count, estimated cost

**Section: Projects** — table:
| Project | Sessions | Tokens | Est. Cost | Bar |
Where "Bar" is a proportional bar showing share of total Claude tokens. Sorted by tokens desc.

**Section: Recent Sessions** — list of last 10 sessions:
- Project name, relative timestamp ("2 hours ago"), token count, model name

#### Page 3: Gemini CLI Detail

Same structure as Claude detail page but with blue accent palette.

If Gemini data is sparse or not found:
- Show a grey card with the message: "No local session data found."
- Below it: instructions on how to enable local telemetry in `~/.gemini/settings.json` (link opens in browser)
- Still show the page structure greyed out / with zeroes

### 6.8 Idle / Splash Screen (Claudepix Animations)

When the app has been idle (no mouse movement inside window) for **60 seconds**, the main content area crossfades to a full-screen animation canvas. The animations are pixel-art Claude sprites from `https://claudepix.vercel.app`.

**Implementation approach:**
- On first load, fetch the sprite data from claudepix (scrape the frame data and palettes as Clawdmeter does, or use the API if one exists)
- Cache sprite data in `electron-store` so it works offline after first fetch
- Display sprites upscaled to fill the available canvas (nearest-neighbor interpolation to keep pixel-art crispness)
- Auto-rotate through multiple animations every 20 seconds
- Choose animation "mood" based on combined token usage rate:
  - Low usage (< 10K tokens today): calm/idle animations
  - Medium usage (10K–50K today): active animations
  - High usage (> 50K today): excited/busy animations
- Any mouse movement inside the window dismisses the idle screen instantly
- Clicking the idle screen also dismisses it

**Fallback:** If claudepix is unreachable and no cached data exists, show a simple pulsing dot animation in the CLI's accent color instead.

---

## 7. Refresh & Performance

| Behaviour | Spec |
|---|---|
| Auto-refresh interval | Every 60 seconds |
| On-demand refresh | Manual "↻ Refresh" button in title bar |
| Scan strategy | Incremental: only re-read `.jsonl` files whose `mtime` has changed since last scan |
| First load | Full scan of all files; show loading screen while scanning |
| Max JSONL file size | Skip files > 200MB (log warning to debug) |
| Parse errors | Skip bad lines silently; continue parsing rest of file |
| Chart animation | CSS transition on bar height, 400ms ease |
| Meter bars | Animated width transition, 800ms cubic-bezier on data load |

---

## 8. Settings (v1 — minimal)

Accessible via a gear icon in the sidebar bottom. A simple modal panel (not a separate window).

| Setting | Type | Default |
|---|---|---|
| Refresh interval | Dropdown: 30s / 60s / 5min / Manual only | 60s |
| Look-back window | Dropdown: 14 days / 30 days / 90 days | 14 days (charts) |
| Custom Claude projects path | Text field | `%USERPROFILE%\.claude\projects` |
| Custom Gemini sessions path | Text field | `%USERPROFILE%\.gemini\tmp\chats` |
| Idle animation timeout | Dropdown: 30s / 60s / 5min / Never | 60s |
| Open at login | Toggle | Off |

Settings stored via `electron-store` in `%APPDATA%\Tokenmeter\config.json`.

---

## 9. File & Project Structure

```
tokenmeter/
├── package.json
├── main.js                    # Electron main process
├── preload.js                 # Context bridge
├── pricing.json               # Token pricing table (user-editable)
├── renderer/
│   ├── index.html             # App shell
│   ├── app.js                 # Main UI logic & page routing
│   ├── animations.js          # Claudepix idle screen logic
│   └── styles.css             # All CSS
├── src/
│   ├── scanner.js             # File scanning coordinator
│   ├── claude-parser.js       # Claude JSONL parser & aggregator
│   ├── gemini-parser.js       # Gemini JSONL parser & aggregator
│   ├── pricer.js              # Cost estimation from pricing.json
│   └── cache.js               # Incremental scan cache using electron-store
├── assets/
│   └── icon.ico               # App icon (Windows)
└── build/
    └── (electron-builder output)
```

---

## 10. Error States & Edge Cases

| Situation | Behaviour |
|---|---|
| `~/.claude` not found | Claude card shows "Not Detected" state in grey |
| `~/.gemini` not found | Gemini card shows "Not Detected" state in grey |
| JSONL file is empty | Skip silently |
| JSONL line is malformed JSON | Skip line, continue |
| JSONL file > 200MB | Skip file entirely, log to debug |
| Model name not in pricing table | Use `default` pricing, note "(estimated)" |
| claudepix unreachable + no cache | Fallback pulsing dot animation |
| Google Fonts unreachable | Fall back to: `monospace`, `sans-serif` system fonts |
| Scan takes > 5s | Show progress indicator in title bar |
| Zero tokens found for a CLI | Show card with all zeros + "No usage data found" note |
| Future: NIM CLI data | Reserved `nim` key in UsageData object — just returns `available: false` for now |

---

## 11. Build & Distribution

- Packaged with `electron-builder` targeting Windows NSIS installer
- Output: `Tokenmeter-Setup-1.0.0.exe`
- No auto-update in v1 (manual download)
- App ID: `com.dewashish.tokenmeter`
- Icons: `assets/icon.ico` (256×256 Windows icon)

**`package.json` build config:**
```json
{
  "build": {
    "appId": "com.dewashish.tokenmeter",
    "productName": "Tokenmeter",
    "win": {
      "target": "nsis",
      "icon": "assets/icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    }
  }
}
```

---

## 12. Claude Code Developer Instructions

When implementing Tokenmeter with Claude Code, use this document as the single source of truth. Key implementation order:

1. **Scaffold** — `package.json`, `main.js`, `preload.js`, `renderer/index.html` with frameless window
2. **Parsers** — `claude-parser.js` first (richest data), then `gemini-parser.js`
3. **Pricer** — `pricer.js` reading from `pricing.json`
4. **IPC** — wire `get-usage-data` through to the scanner, return `UsageData` object
5. **UI shell** — title bar, sidebar, page routing
6. **Overview page** — stat cards + CLI summary cards + combined chart
7. **Claude detail page** — full breakdown
8. **Gemini detail page** — full breakdown with fallback states
9. **Idle animations** — claudepix fetch, cache, display
10. **Settings modal**
11. **electron-builder config** — packaging

**Important notes for Claude Code:**
- Use `contextIsolation: true` and `nodeIntegration: false` in `webPreferences` — expose everything via `preload.js`'s `contextBridge`
- All file I/O happens in `main.js` only, never in the renderer
- Windows paths: use `process.env.USERPROFILE` (not `os.homedir()` — same thing but more explicit for Windows)
- The Claude projects folder on this machine uses `--` as the path separator in folder names (e.g. `C--Users-Dewashish-Lambore-desktop-projects-burnlink`)
- Do not use `shell: true` in any child process unless absolutely necessary
- Chart.js should be loaded from CDN in `index.html` (no npm install needed in renderer)

---

## 13. v2 Roadmap (Out of Scope Now, Document for Reference)

- System tray icon showing combined token count, click to open full window
- NIM / free-claude-code tracking (once data paths are confirmed)
- OpenCode tracking (`%LOCALAPPDATA%\opencode\` SQLite)
- Windows notifications when daily token burn exceeds a user-set threshold
- Export usage data to CSV
- Per-project cost budgets with visual warning
- "Always on top" mode — small floating widget variant
- Dark/light theme toggle

---

*Document prepared: May 2026. Pricing figures reflect Anthropic API rates as of that date and should be verified before distribution.*
