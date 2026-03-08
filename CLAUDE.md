# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands use Bun. Run from the repo root unless noted.

```bash
# Development
bun run dev:backend              # Hono server on port 7890 (hot reload)
IMPACT_LLM=1 bun run dev:backend # With Ollama AI features enabled
bun run dev:dashboard            # Preact SPA dev server
bun run dev:extension            # Extension watch build

# Production build (order matters: shared → dashboard → extension)
bun run build

# Database
bun run db:generate              # Generate Drizzle migration files
bun run db:migrate               # Apply migrations to SQLite
```

There are no test commands — this project has no test suite.

Linting/formatting uses Biome (tabs, strict mode). Run via `bunx biome check` or `bunx biome format`.

## Architecture

Monorepo with four packages:

- **`packages/shared`** — Types, Zod schemas, constants (e.g. `BACKEND_PORT=7890`). Must be built before other packages: `bun run build:shared`. All packages reference it via workspace dependency.
- **`packages/extension`** — Chrome MV3 extension (Vite + CRXJS plugin). Service worker tracks visits and manages icon state. Content script extracts prices/dates/TODOs. Popup triggers snapshots and opens dashboard.
- **`packages/backend`** — Hono server on Bun with SQLite via Drizzle ORM. Runs DB migrations on startup (`src/index.ts`). Serves the built dashboard SPA from `packages/dashboard/dist/`. API routes under `src/api/`.
- **`packages/dashboard`** — Preact SPA. Built output is served by the backend. Router is query-string based (e.g. `?view=diff&domain=X&url=Y`).

### Data Flow

1. Extension content script extracts page data → service worker batches and POSTs to `localhost:7890/api/visits`
2. User clicks "Show differences" in popup → content script captures full snapshot data → POST to `/api/snapshots` → dashboard opens at `?view=diff`
3. Backend scheduler runs every 5 minutes → analyzers generate suggestions
4. AI features (Ollama): embeddings stored in `page_snapshots.embedding` as JSON float array; `/api/snapshots/ask` does cosine similarity search then generates a response

### Key Files

- `packages/backend/src/db/schema.ts` — All table definitions (source of truth for data model)
- `packages/backend/src/index.ts` — Server startup, runs inline SQL migrations before Drizzle migrations
- `packages/extension/src/background/service-worker.ts` — Visit tracking, icon management, message routing
- `packages/extension/src/content/extractor.ts` — Page data extraction logic
- `packages/shared/src/index.ts` — Shared types and constants

### Environment Variables (backend)

| Variable | Default | Purpose |
|---|---|---|
| `IMPACT_LLM` | `0` | Enable Ollama AI features |
| `OLLAMA_MODEL` | `llama3.2` | Generation model |
| `OLLAMA_EMBEDDING_MODEL` | `embeddinggemma` | Embedding model |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint |
| `BACKEND_PORT` | `7890` | Server port |

### Icon Dot Indicator

The extension uses `OffscreenCanvas` + `chrome.action.setIcon` (not the badge API) to render a colored dot on the extension icon. Green = committed snapshot exists for current page, red = none. Icon bitmaps are cached in a `Map` after first render.

### Snapshot Versioning

Snapshot versions use format `YYYY.MM.DD.NN` where NN is a zero-padded counter per day. Status is `pending` until user clicks "Save this version" in the dashboard diff view, which sets it to `committed`.
