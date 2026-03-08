import app from "./server.js";
import { BACKEND_PORT } from "@impact/shared";
import { startScheduler } from "./services/scheduler.js";

// Run migrations on startup (create tables if they don't exist)
import { db, schema } from "./db/client.js";
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

db.run(sql`CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS public_site_labels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_pattern TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  contributor TEXT NOT NULL DEFAULT 'anonymous',
  last_pushed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);

db.run(sql`CREATE TABLE IF NOT EXISTS llm_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model TEXT NOT NULL,
  operation TEXT NOT NULL DEFAULT 'unknown',
  url TEXT,
  plugin_name TEXT,
  prompt_chars INTEGER NOT NULL,
  response_chars INTEGER NOT NULL DEFAULT 0,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_duration_ms INTEGER,
  eval_duration_ms INTEGER,
  wall_duration_ms INTEGER NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  success INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  created_at INTEGER NOT NULL
)`);
db.run(sql`CREATE INDEX IF NOT EXISTS idx_llm_stats_model ON llm_stats(model)`);
db.run(sql`CREATE INDEX IF NOT EXISTS idx_llm_stats_created ON llm_stats(created_at)`);
db.run(sql`CREATE INDEX IF NOT EXISTS idx_llm_stats_operation ON llm_stats(operation)`);

import { eq, and } from "drizzle-orm";

// Sync prompt_configs → plugin_configs (runs every startup to catch any that were missed)
{
	const existing = db.select().from(schema.promptConfigs).all();
	for (const row of existing) {
		const already = db.select().from(schema.pluginConfigs)
			.where(and(
				eq(schema.pluginConfigs.pluginName, "llm-extraction"),
				eq(schema.pluginConfigs.urlPattern, row.urlPattern)
			))
			.get();

		if (already) {
			const currentConfig = already.config ? JSON.parse(already.config) as Record<string, unknown> : {};
			const newConfig = { ...currentConfig, prompt: row.prompt };
			db.update(schema.pluginConfigs)
				.set({ 
					config: JSON.stringify(newConfig), 
					updatedAt: row.updatedAt 
				})
				.where(eq(schema.pluginConfigs.id, already.id))
				.run();
		} else {
			db.insert(schema.pluginConfigs)
				.values({
					pluginName: "llm-extraction",
					urlPattern: row.urlPattern,
					enabled: true,
					config: JSON.stringify({ prompt: row.prompt }),
					priority: 0,
					createdAt: row.createdAt,
					updatedAt: row.updatedAt
				})
				.run();
		}
	}
}

console.log(`Impact backend starting on http://localhost:${BACKEND_PORT}`);
startScheduler();

export default {
	port: BACKEND_PORT,
	fetch: app.fetch,
};
