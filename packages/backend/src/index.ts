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
	extracted_at INTEGER NOT NULL
)`);
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

console.log(`Impact backend starting on http://localhost:${BACKEND_PORT}`);
startScheduler();

export default {
	port: BACKEND_PORT,
	fetch: app.fetch,
};
