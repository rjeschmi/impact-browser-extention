import app from "./server.js";
import { db } from "./db/client.js";
import { sql } from "drizzle-orm";

// Create table if not exists (inline SQL migration)
db.run(sql`CREATE TABLE IF NOT EXISTS registry_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_pattern TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  config_bundle TEXT NOT NULL,
  sample_data TEXT,
  contributor TEXT NOT NULL DEFAULT 'anonymous',
  pushed_at INTEGER NOT NULL,
  push_count INTEGER NOT NULL DEFAULT 1
)`);

console.log("Registry server starting on http://localhost:7891");

export default {
	port: 7891,
	fetch: app.fetch,
};
