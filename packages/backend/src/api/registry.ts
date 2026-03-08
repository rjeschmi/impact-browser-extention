import { Hono } from "hono";
import { db, schema } from "../db/client.js";
import { eq, like, sql } from "drizzle-orm";
import { REGISTRY_URL } from "@impact/shared";

const app = new Hono();

// GET /api/registry/labels — list all public_site_labels
app.get("/labels", (c) => {
	const labels = db.select().from(schema.publicSiteLabels).all();
	return c.json({ labels });
});

// POST /api/registry/labels — create or update (upsert by urlPattern)
app.post("/labels", async (c) => {
	try {
		const body = (await c.req.json()) as {
			urlPattern: string;
			label: string;
			description?: string;
			contributor?: string;
		};

		if (!body.urlPattern?.trim() || !body.label?.trim()) {
			return c.json({ error: "urlPattern and label are required" }, 400);
		}

		const now = Date.now();
		const existing = db
			.select()
			.from(schema.publicSiteLabels)
			.where(eq(schema.publicSiteLabels.urlPattern, body.urlPattern.trim()))
			.get();

		let labelRow;
		if (existing) {
			labelRow = db
				.update(schema.publicSiteLabels)
				.set({
					label: body.label.trim(),
					description: body.description ?? existing.description,
					contributor: body.contributor ?? existing.contributor,
					updatedAt: now,
				})
				.where(eq(schema.publicSiteLabels.id, existing.id))
				.returning()
				.get();
		} else {
			labelRow = db
				.insert(schema.publicSiteLabels)
				.values({
					urlPattern: body.urlPattern.trim(),
					label: body.label.trim(),
					description: body.description,
					contributor: body.contributor ?? "anonymous",
					createdAt: now,
					updatedAt: now,
				})
				.returning()
				.get();
		}

		return c.json(labelRow, existing ? 200 : 201);
	} catch (e) {
		return c.json({ error: String(e) }, 500);
	}
});

// DELETE /api/registry/labels/:id
app.delete("/labels/:id", (c) => {
	const id = Number(c.req.param("id"));
	db.delete(schema.publicSiteLabels).where(eq(schema.publicSiteLabels.id, id)).run();
	return c.json({ ok: true });
});

// POST /api/registry/labels/:id/push — bundle and push to registry
app.post("/labels/:id/push", async (c) => {
	try {
		const id = Number(c.req.param("id"));
		const labelRow = db
			.select()
			.from(schema.publicSiteLabels)
			.where(eq(schema.publicSiteLabels.id, id))
			.get();

		if (!labelRow) return c.json({ error: "Label not found" }, 404);

		// Extract domain from urlPattern
		let domain: string;
		try {
			domain = new URL(labelRow.urlPattern.replace(/\*/g, "x")).hostname;
		} catch {
			return c.json({ error: "Invalid urlPattern — cannot extract domain" }, 400);
		}

		// Query prompt_configs and plugin_configs matching the domain
		const promptConfigs = db
			.select()
			.from(schema.promptConfigs)
			.where(like(schema.promptConfigs.urlPattern, `%${domain}%`))
			.all();

		const pluginConfigs = db
			.select()
			.from(schema.pluginConfigs)
			.where(like(schema.pluginConfigs.urlPattern, `%${domain}%`))
			.all();

		// Get latest committed snapshot for the domain
		const snapshot = db
			.select()
			.from(schema.pageSnapshots)
			.where(sql`${schema.pageSnapshots.domain} = ${domain} AND ${schema.pageSnapshots.status} = 'committed'`)
			.orderBy(sql`${schema.pageSnapshots.committedAt} DESC`)
			.get();

		// Build configBundle
		const configBundle = {
			schemaVersion: "1",
			extensionVersion: "0.1.0",
			urlPattern: labelRow.urlPattern,
			domain,
			promptConfigs: promptConfigs.map((p) => ({
				urlPattern: p.urlPattern,
				prompt: p.prompt,
			})),
			pluginConfigs: pluginConfigs.map((p) => ({
				pluginName: p.pluginName,
				urlPattern: p.urlPattern,
				enabled: p.enabled,
				config: p.config ? JSON.parse(p.config) : {},
			})),
		};

		// Parse and re-stringify sampleData if present
		let sampleData: string | undefined;
		if (snapshot?.data) {
			try {
				sampleData = JSON.stringify(JSON.parse(snapshot.data));
			} catch {
				sampleData = undefined;
			}
		}

		// POST to registry
		const registryRes = await fetch(`${REGISTRY_URL}/api/entries`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				urlPattern: labelRow.urlPattern,
				domain,
				label: labelRow.label,
				description: labelRow.description,
				configBundle: JSON.stringify(configBundle),
				sampleData,
				contributor: labelRow.contributor,
			}),
		});

		if (!registryRes.ok) {
			const err = await registryRes.text();
			return c.json({ error: `Registry error: ${err}` }, 502);
		}

		const entry = await registryRes.json();

		// Update lastPushedAt
		const now = Date.now();
		db.update(schema.publicSiteLabels)
			.set({ lastPushedAt: now, updatedAt: now })
			.where(eq(schema.publicSiteLabels.id, id))
			.run();

		return c.json({ ok: true, entry });
	} catch (e) {
		return c.json({ error: String(e) }, 500);
	}
});

// GET /api/registry/browse — proxy to registry
app.get("/browse", async (c) => {
	try {
		const params = new URLSearchParams();
		const q = c.req.query("q");
		const domain = c.req.query("domain");
		if (q) params.set("q", q);
		if (domain) params.set("domain", domain);

		const url = `${REGISTRY_URL}/api/entries${params.toString() ? `?${params}` : ""}`;
		const res = await fetch(url);
		if (!res.ok) return c.json({ error: "Registry unavailable" }, 502);
		const data = await res.json();
		return c.json(data);
	} catch (e) {
		return c.json({ error: String(e) }, 500);
	}
});

// GET /api/registry/browse/:id — proxy to registry entry by id
app.get("/browse/:id", async (c) => {
	try {
		const id = c.req.param("id");
		const res = await fetch(`${REGISTRY_URL}/api/entries/${id}`);
		if (!res.ok) return c.json({ error: "Not found" }, 404);
		const data = await res.json();
		return c.json(data);
	} catch (e) {
		return c.json({ error: String(e) }, 500);
	}
});

// POST /api/registry/import — import a registry entry locally
app.post("/import", async (c) => {
	try {
		const { entryId } = (await c.req.json()) as { entryId: number };
		if (!entryId) return c.json({ error: "entryId is required" }, 400);

		// Fetch the entry from registry
		const res = await fetch(`${REGISTRY_URL}/api/entries/${entryId}`);
		if (!res.ok) return c.json({ error: "Entry not found in registry" }, 404);

		const entry = (await res.json()) as {
			id: number;
			urlPattern: string;
			domain: string;
			label: string;
			configBundle: string;
		};

		let configBundle: {
			promptConfigs?: { urlPattern: string; prompt: string }[];
			pluginConfigs?: { pluginName: string; urlPattern: string; enabled: boolean; config: Record<string, unknown> }[];
		};
		try {
			configBundle = JSON.parse(entry.configBundle);
		} catch {
			return c.json({ error: "Invalid configBundle in registry entry" }, 400);
		}

		const now = Date.now();
		let promptConfigCount = 0;
		let pluginConfigCount = 0;

		// Upsert prompt configs
		for (const pc of configBundle.promptConfigs ?? []) {
			const existing = db
				.select()
				.from(schema.promptConfigs)
				.where(eq(schema.promptConfigs.urlPattern, pc.urlPattern))
				.get();
			if (existing) {
				db.update(schema.promptConfigs)
					.set({ prompt: pc.prompt, updatedAt: now })
					.where(eq(schema.promptConfigs.id, existing.id))
					.run();
			} else {
				db.insert(schema.promptConfigs)
					.values({ urlPattern: pc.urlPattern, prompt: pc.prompt, createdAt: now, updatedAt: now })
					.run();
			}
			promptConfigCount++;
		}

		// Upsert plugin configs
		for (const pc of configBundle.pluginConfigs ?? []) {
			const existing = db
				.select()
				.from(schema.pluginConfigs)
				.where(
					sql`${schema.pluginConfigs.pluginName} = ${pc.pluginName} AND ${schema.pluginConfigs.urlPattern} = ${pc.urlPattern}`,
				)
				.get();
			if (existing) {
				db.update(schema.pluginConfigs)
					.set({
						enabled: pc.enabled,
						config: JSON.stringify(pc.config),
						updatedAt: now,
					})
					.where(eq(schema.pluginConfigs.id, existing.id))
					.run();
			} else {
				db.insert(schema.pluginConfigs)
					.values({
						pluginName: pc.pluginName,
						urlPattern: pc.urlPattern,
						enabled: pc.enabled,
						config: JSON.stringify(pc.config),
						priority: 0,
						createdAt: now,
						updatedAt: now,
					})
					.run();
			}
			pluginConfigCount++;
		}

		return c.json({ ok: true, imported: { promptConfigs: promptConfigCount, pluginConfigs: pluginConfigCount } });
	} catch (e) {
		return c.json({ error: String(e) }, 500);
	}
});

export default app;
