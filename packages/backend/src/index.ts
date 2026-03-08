import app from "./server.js";
import { BACKEND_PORT } from "@impact/shared";
import { startScheduler } from "./services/scheduler.js";

// Run migrations on startup (create tables if they don't exist)
import { db } from "./db/client.js";
import { sql } from "drizzle-orm";

// Auto-create tables using raw SQL (avoids needing drizzle-kit for dev)
db.run(sql`CREATE TABLE IF NOT EXISTS page_visits (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	url TEXT NOT NULL,
	domain TEXT NOT NULL,
	title TEXT NOT NULL,
	visited_at INTEGER NOT NULL,
	duration_ms INTEGER NOT NULL DEFAULT 0,
	referrer_url TEXT
)`);
db.run(
	sql`CREATE INDEX IF NOT EXISTS idx_visits_domain ON page_visits(domain)`,
);

db.run(sql`CREATE TABLE IF NOT EXISTS extractions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	visit_id INTEGER REFERENCES page_visits(id),
	url TEXT NOT NULL,
	kind TEXT NOT NULL,
	value TEXT NOT NULL,
	context TEXT,
	metadata TEXT,
	extracted_at INTEGER NOT NULL,
	is_pinned INTEGER NOT NULL DEFAULT 0
)`);
// Migrate existing DBs that predate is_pinned
try { db.run(sql`ALTER TABLE extractions ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0`); } catch {}
db.run(
	sql`CREATE INDEX IF NOT EXISTS idx_extractions_url_kind ON extractions(url, kind)`,
);

db.run(sql`CREATE TABLE IF NOT EXISTS suggestions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	type TEXT NOT NULL,
	title TEXT NOT NULL,
	body TEXT NOT NULL,
	url TEXT NOT NULL,
	priority INTEGER NOT NULL DEFAULT 3,
	status TEXT NOT NULL DEFAULT 'active',
	created_at INTEGER NOT NULL,
	snoozed_until INTEGER,
	source_analyzer TEXT NOT NULL
)`);
db.run(
	sql`CREATE INDEX IF NOT EXISTS idx_suggestions_status_priority ON suggestions(status, priority)`,
);

db.run(sql`CREATE TABLE IF NOT EXISTS reminders (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	url TEXT,
	title TEXT NOT NULL,
	note TEXT NOT NULL DEFAULT '',
	remind_at INTEGER NOT NULL,
	status TEXT NOT NULL DEFAULT 'pending',
	created_at INTEGER NOT NULL
)`);
db.run(
	sql`CREATE INDEX IF NOT EXISTS idx_reminders_status_remind_at ON reminders(status, remind_at)`,
);

db.run(sql`CREATE TABLE IF NOT EXISTS page_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  version TEXT NOT NULL,
  data TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  captured_at INTEGER NOT NULL,
  committed_at INTEGER
)`);
db.run(sql`CREATE INDEX IF NOT EXISTS idx_snapshots_url_status ON page_snapshots(url, status)`);
db.run(sql`CREATE INDEX IF NOT EXISTS idx_snapshots_domain ON page_snapshots(domain)`);
try { db.run(sql`ALTER TABLE page_snapshots ADD COLUMN embedding TEXT`); } catch {}
try { db.run(sql`ALTER TABLE page_snapshots ADD COLUMN page_text TEXT`); } catch {}

db.run(sql`CREATE TABLE IF NOT EXISTS prompt_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_pattern TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

// page_html column on snapshots
try { db.run(sql`ALTER TABLE page_snapshots ADD COLUMN page_html TEXT`); } catch {}

// Plugin configs table
db.run(sql`CREATE TABLE IF NOT EXISTS plugin_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plugin_name TEXT NOT NULL,
  url_pattern TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
db.run(sql`CREATE INDEX IF NOT EXISTS idx_plugin_configs_name ON plugin_configs(plugin_name)`);

// Plugin logs table
db.run(sql`CREATE TABLE IF NOT EXISTS plugin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id INTEGER REFERENCES page_snapshots(id),
  plugin_name TEXT NOT NULL,
  url TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  input_data TEXT,
  output_data TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
)`);
db.run(sql`CREATE INDEX IF NOT EXISTS idx_plugin_logs_snapshot ON plugin_logs(snapshot_id)`);
db.run(sql`CREATE INDEX IF NOT EXISTS idx_plugin_logs_plugin ON plugin_logs(plugin_name)`);

// Sync prompt_configs → plugin_configs (runs every startup to catch any that were missed)
{
	const existing = db.all(sql`SELECT id, url_pattern, prompt, created_at, updated_at FROM prompt_configs`);
	for (const row of existing as { id: number; url_pattern: string; prompt: string; created_at: number; updated_at: number }[]) {
		const already = db.get(sql`SELECT id FROM plugin_configs WHERE plugin_name = 'llm-extraction' AND url_pattern = ${row.url_pattern}`);
		if (already) {
			db.run(sql`UPDATE plugin_configs SET config = ${JSON.stringify({ prompt: row.prompt })}, updated_at = ${row.updated_at} WHERE plugin_name = 'llm-extraction' AND url_pattern = ${row.url_pattern}`);
		} else {
			db.run(sql`INSERT INTO plugin_configs (plugin_name, url_pattern, enabled, config, priority, created_at, updated_at)
				VALUES ('llm-extraction', ${row.url_pattern}, 1, ${JSON.stringify({ prompt: row.prompt })}, 0, ${row.created_at}, ${row.updated_at})`);
		}
	}
}

console.log(`Impact backend starting on http://localhost:${BACKEND_PORT}`);
startScheduler();

export default {
	port: BACKEND_PORT,
	fetch: app.fetch,
};
