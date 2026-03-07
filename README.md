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

## AI Suggestions (Ollama)

To enable LLM-powered suggestions using a local model:

```bash
ollama pull llama3.2
IMPACT_LLM=1 bun run dev:backend
```

Override the model:
```bash
OLLAMA_MODEL=llama3.1:8b IMPACT_LLM=1 bun run dev:backend
```

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
| `IMPACT_LLM` | `0` | Set to `1` to enable Ollama LLM analyzer |
| `OLLAMA_MODEL` | `llama3.2` | Ollama model to use |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |

## Data

All data is stored locally in `packages/backend/data/impact.db` (SQLite). Export or purge it from the **Settings** tab in the dashboard.
