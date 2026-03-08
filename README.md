# Impact

A privacy-first browser activity tracker. Passively tracks your browsing, extracts useful content (prices, deadlines, TODOs), and surfaces smart reminders — all locally, no data ever leaves your machine.

## Architecture

```
impact/
├── packages/
│   ├── shared/       # Shared TypeScript types and constants
│   ├── backend/      # Hono HTTP server + SQLite (Bun)
│   ├── extension/    # Chrome Manifest V3 extension (Vite + CRXJS)
│   └── dashboard/    # Web UI served by backend (Preact + Vite)
```

## Requirements

- [Bun](https://bun.sh) 1.x
- Chrome (for the extension)
- [Ollama](https://ollama.com) (optional, for AI-powered suggestions)

## Setup

```bash
bun install
```

## Development

Start the backend:
```bash
bun run dev:backend
```

Build the extension:
```bash
bun run build:extension
```

Build the dashboard:
```bash
bun run build:dashboard
```

### Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `packages/extension/dist`

### Open the dashboard

Visit `http://localhost:7890` in your browser.

## Distribution

To share Impact with others (or reinstall on a new machine), the cleanest approach is to distribute the built extension alongside a running backend.

### Packaging the extension

Build everything first:
```bash
bun run build
```

Then zip `packages/extension/dist/` — that folder is the complete, loadable extension. Recipients load it via **Load unpacked** in `chrome://extensions`.

### Auto-starting the backend on macOS

To have the backend start automatically at login without keeping a terminal open:

1. Create `~/Library/LaunchAgents/com.impact.backend.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.impact.backend</string>
  <key>ProgramArguments</key>
  <array>
    <string>/path/to/bun</string>
    <string>run</string>
    <string>dev:backend</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/path/to/impact</string>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/impact-backend.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/impact-backend.log</string>
</dict>
</plist>
```

Replace `/path/to/bun` (find it with `which bun`) and `/path/to/impact` with your actual paths.

2. Load the service:

```bash
launchctl load ~/Library/LaunchAgents/com.impact.backend.plist
```

To unload: `launchctl unload ~/Library/LaunchAgents/com.impact.backend.plist`

Logs go to `/tmp/impact-backend.log`.

---

## AI Features (optional)

AI features use [Ollama](https://ollama.com) running locally. They are **disabled by default** — the extension and dashboard work without them.

### Setup

1. **Install Ollama**: Download from [ollama.com](https://ollama.com). After installation, Ollama runs as a background service on `localhost:11434`.

2. **Pull the required models**:

```bash
ollama pull qwen2.5-coder:3b
ollama pull embeddinggemma
```

   First pull is ~2–3 GB. This only needs to be done once.

3. **Start the backend with AI enabled**:

```bash
IMPACT_LLM=1 bun run dev:backend
```

If using the launchd plist above, add an `EnvironmentVariables` section:

```xml
<key>EnvironmentVariables</key>
<dict>
  <key>IMPACT_LLM</key>
  <string>1</string>
</dict>
```

### What AI enables

- **LLM extraction**: Snapshots are processed through a configurable prompt to extract structured data (prices, dates, summaries)
- **Prompt configs**: Per-URL-pattern prompts (managed in the dashboard Settings)
- **Semantic search**: Find past snapshots by meaning via `/api/snapshots/search`
- **Chat**: Ask questions across saved page snapshots

### Changing the model

Via environment variable:
```bash
OLLAMA_MODEL=llama3.2 IMPACT_LLM=1 bun run dev:backend
```

Or change it in the dashboard Settings page — the setting persists in the database.

## What it tracks

- **Page visits** — URL, title, domain, time spent
- **Prices** — detected via CSS selectors and regex
- **Deadlines** — dates near keywords like "due", "expires", "deadline"
- **TODOs** — checkboxes and action item keywords
- **Keywords** — page metadata and Open Graph tags

## Suggestion engine

Rule-based analyzers run every 5 minutes:

| Analyzer | Trigger |
|---|---|
| Frequency | Domain visited 5+ times in 7 days |
| Staleness | Domain not visited in 14+ days (was previously frequent) |
| Deadline | Extracted date within 7 days |
| Price change | Same URL has a different price than last visit |
| LLM (optional) | Ollama-powered analysis of recent activity |

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `IMPACT_LLM` | `0` | Set to `1` to enable Ollama AI features |
| `OLLAMA_MODEL` | `qwen2.5-coder:3b` | Generation model name |
| `OLLAMA_EMBED_MODEL` | `embeddinggemma` | Embedding model name |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint |
| `BACKEND_PORT` | `7890` | Backend server port |

## Data

All data is stored locally in `packages/backend/data/impact.db` (SQLite). Export or purge it from the **Settings** tab in the dashboard.
